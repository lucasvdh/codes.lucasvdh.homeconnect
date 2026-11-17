---
description: Frequently asked questions and troubleshooting
---

# FAQ and troubleshooting

## Can I pair on my phone?

No. The login needs the developer tools of a desktop browser, and phones and tablets don't have those. Open the app settings on a computer through [my.homey.app](https://my.homey.app) > Apps > Home Connect. See [Pairing](../getting-started/pairing.md).

## The page hangs after I log in. Did something go wrong?

No, that is expected. The browser can't open the `hcauth://` address it is sent to. The code you need is in the developer tools; follow the steps in [Pairing](../getting-started/pairing.md#log-in-with-your-browser).

## My appliance shows as unavailable

The device in Homey and the card in the app settings say why:

| Message | What to check |
| --- | --- |
| Homey can't find the appliance on the network | Is the appliance switched on and connected to the same network as Homey? Some models turn Wi-Fi off in standby. |
| The appliance doesn't answer | Same network as Homey, not a guest or IoT network? |
| The appliance refused the connection | Its address may have changed; the app keeps looking for it. |
| Homey can't reach the appliance's network | The appliance is on another network or VLAN. See below. |
| The appliance didn't accept the security key | Press **Refresh appliances** in the app settings to fetch the current keys. |
| The appliance closed the connection | Is it also added to another Homey or controller? Remove it there. |

## My appliances are on a separate network or VLAN

Homey finds appliances via mDNS, which usually doesn't cross networks. Homey must also be able to reach the appliance on port 443 (port 80 for some models). Put the appliances on the same network as Homey, or allow that traffic between the networks in your router.

## Can I use the same appliance on two Homeys?

Not reliably. An appliance may accept only one local connection at a time, so two Homeys can push each other off. Add it to one Homey.

## Do I still need the official Home Connect app?

To add new appliances to your Home Connect account, yes. Day to day, this app talks to the appliances locally and doesn't need the Home Connect cloud.

## Starting a program doesn't work

Check that **Remote start** is enabled on the appliance. On some models you have to enable it on the appliance itself each time. The app also refuses to start a program while the door is open.

## How do I report a problem?

1. In the Homey app, open Home Connect (Local) and choose **Create diagnostics report**. Do this right after the problem happens.
2. Post the report ID, a screenshot of the appliance's card in the app settings and what you did, in the [forum topic](https://community.homey.app/t/155077) or as a [GitHub issue](https://github.com/lucasvdh/codes.lucasvdh.homeconnect/issues).

Never share your `devices.json` or the `key` and `iv` values in it.
