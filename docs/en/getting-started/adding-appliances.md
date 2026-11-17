---
description: Add your paired appliances to Homey
---

# Adding appliances

1. In the Homey app, go to **Devices** > **+** > **Home Connect (Local)**.
2. Choose the type of appliance, for example **Dishwasher**.
3. Select the appliances you want to add and confirm.

Only appliances of the chosen type appear. If the list is empty, check the app settings: the appliance must be in the list there, and its type must be supported.

## What you see in the app settings

The settings page shows a card per appliance with its status:

| Status | Meaning |
| --- | --- |
| Connected | Homey is talking to the appliance locally. |
| Connecting… | Homey is setting up the connection. |
| Unavailable | Homey can't reach the appliance. The card says why; see [FAQ and troubleshooting](../overview/faq.md). |
| Not added yet | The appliance is paired but not added to Homey. |
| Not supported yet | There is no driver for this type of appliance yet. |

Open **Technical details** on a card for the reason, the last address and whether Homey saw the appliance on the network (mDNS). A screenshot of that card helps a lot when you ask for help.

## Tips

- Switch the appliance on when you add it. Some models turn their Wi-Fi off in standby.
- Homey and the appliance must be on the same network. See [FAQ](../overview/faq.md) if they are on different networks or VLANs.
- Many actions, such as starting a program, require **Remote start** to be enabled on the appliance itself.
