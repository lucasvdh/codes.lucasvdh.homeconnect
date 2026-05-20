"use strict";

import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

import { DeviceDescription, FeatureDescriptor } from "./types";

/**
 * IDDF parser - the Node port of hcpy's HCxml2json.py.
 *
 * Each appliance has an "IDDF" ZIP from Home Connect containing two XML
 * files: `*_FeatureMapping.xml` (UID -> dotted name, plus enum tables) and
 * `*_DeviceDescription.xml` (per-UID access/availability/refCID/refDID and,
 * for enum-typed features, which enum table applies). We collapse both into
 * a single `{ description, features }` object - the exact shape hcpy writes
 * into devices.json, so the local protocol code can stay format-agnostic.
 *
 * UIDs are hex in the XML (`refUID="0200"`, `uid="17C0"`) and decimal-string
 * keyed in the output (`"512"`), matching the websocket payloads.
 */

export interface ParsedIddf {
  description: DeviceDescription;
  features: Record<string, FeatureDescriptor>;
}

/**
 * fast-xml-parser in preserveOrder mode yields nodes shaped like
 * `{ tagName: ChildNode[], ":@"?: attrs }` or `{ "#text": string }`. We need
 * order + attributes + recursion, hence this mode rather than the default.
 */
type PNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  removeNSPrefix: true,
  trimValues: true,
});

function tagOf(node: PNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text") return key;
  }
  return null;
}

function attrsOf(node: PNode): Record<string, string> {
  return (node[":@"] as Record<string, string> | undefined) ?? {};
}

function childrenOf(node: PNode): PNode[] {
  const tag = tagOf(node);
  return tag ? ((node[tag] as PNode[] | undefined) ?? []) : [];
}

function textOf(node: PNode): string {
  for (const child of childrenOf(node)) {
    if ("#text" in child) return String(child["#text"]).trim();
  }
  return "";
}

function findChild(parent: PNode, tag: string): PNode | undefined {
  return childrenOf(parent).find((c) => tagOf(c) === tag);
}

/** Find the single root element node by tag name in a parsed document. */
function rootElement(doc: PNode[], tag: string): PNode {
  const root = doc.find((n) => tagOf(n) === tag);
  if (!root) throw new Error(`IDDF: expected a <${tag}> root element`);
  return root;
}

/**
 * Parse one appliance's IDDF ZIP into `{ description, features }`.
 * The ZIP file names are prefixed with the haId, so we match by suffix.
 */
export function parseIddfZip(zipData: Uint8Array): ParsedIddf {
  const files = unzipSync(zipData);
  const featureMappingName = Object.keys(files).find((n) => n.endsWith("_FeatureMapping.xml"));
  const deviceDescriptionName = Object.keys(files).find((n) =>
    n.endsWith("_DeviceDescription.xml"),
  );
  if (!featureMappingName || !deviceDescriptionName) {
    throw new Error(
      `IDDF ZIP is missing expected XML files (got: ${Object.keys(files).join(", ")})`,
    );
  }
  return parseIddfXml(
    strFromU8(files[featureMappingName]),
    strFromU8(files[deviceDescriptionName]),
  );
}

/** Parse the two IDDF XML documents directly (also used by tests). */
export function parseIddfXml(
  featureMappingXml: string,
  deviceDescriptionXml: string,
): ParsedIddf {
  const features: Record<string, FeatureDescriptor> = {};

  // --- FeatureMapping.xml: UID -> name, plus the enum tables ---------------
  const fmRoot = rootElement(parser.parse(featureMappingXml) as PNode[], "featureMappingFile");

  const featureList = findChild(fmRoot, "featureDescription");
  if (featureList) {
    for (const feature of childrenOf(featureList)) {
      if (tagOf(feature) !== "feature") continue;
      const uid = parseInt(attrsOf(feature).refUID, 16);
      features[String(uid)] = { name: textOf(feature) };
    }
  }

  // enumDescriptionList: refENID (hex) -> { refValue (decimal) -> member name }
  const enums: Record<string, Record<string, string>> = {};
  const enumList = findChild(fmRoot, "enumDescriptionList");
  if (enumList) {
    for (const enumDesc of childrenOf(enumList)) {
      if (tagOf(enumDesc) !== "enumDescription") continue;
      const enid = parseInt(attrsOf(enumDesc).refENID, 16);
      const values: Record<string, string> = {};
      for (const member of childrenOf(enumDesc)) {
        if (tagOf(member) !== "enumMember") continue;
        values[String(parseInt(attrsOf(member).refValue, 10))] = textOf(member);
      }
      enums[String(enid)] = values;
    }
  }

  // --- DeviceDescription.xml: per-UID attributes + the identity block ------
  const ddRoot = rootElement(parser.parse(deviceDescriptionXml) as PNode[], "device");
  const ddChildren = childrenOf(ddRoot);

  // Recursively copy every uid-bearing element's attributes onto its feature,
  // resolving `enumerationType` into the concrete `values` table.
  //
  // Note: hcpy only processes the *descendants* of each top-level element,
  // never the top-level element itself - so the bare uids on <statusList>,
  // <activeProgram>, etc. carry just their name and no attributes. We match
  // that by walking childrenOf() each top-level item rather than the item.
  const walk = (nodes: PNode[]): void => {
    for (const node of nodes) {
      const attrs = attrsOf(node);
      if (attrs.uid !== undefined) {
        const uid = String(parseInt(attrs.uid, 16));
        const entry: FeatureDescriptor = features[uid] ?? (features[uid] = { name: `uid:${uid}` });
        for (const [key, value] of Object.entries(attrs)) {
          if (key === "uid") continue;
          if (key === "enumerationType") {
            const table = enums[String(parseInt(value, 16))];
            if (table) entry.values = table;
          } else {
            entry[key] = value;
          }
        }
      }
      walk(childrenOf(node));
    }
  };
  for (const topLevel of ddChildren) {
    walk(childrenOf(topLevel));
  }

  // The <description> block holds the appliance identity.
  const descEl = findChild(ddRoot, "description");
  const description: Partial<DeviceDescription> = {};
  if (descEl) {
    for (const child of childrenOf(descEl)) {
      const tag = tagOf(child);
      if (!tag || tag === "pairableDeviceTypes") continue;
      (description as Record<string, string>)[tag] = textOf(child);
    }
  }

  return {
    description: {
      type: description.type ?? "",
      brand: description.brand ?? "",
      model: description.model ?? "",
      version: description.version ?? "",
      revision: description.revision ?? "",
    },
    features,
  };
}
