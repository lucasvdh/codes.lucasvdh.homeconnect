---
description: Retrieve the local keys of your appliances, once
---

# Pairing your Home Connect account

To talk to an appliance locally, Homey needs that appliance's key. The keys are retrieved once through your Home Connect account (SingleKey ID). After that, all communication stays on your own network.

{% hint style="warning" %}
Pairing doesn't work on a phone or tablet. Use a computer and open the app settings through [my.homey.app](https://my.homey.app) > Apps > Home Connect.
{% endhint %}

There are two ways to pair:

| Method | What you need | When to use it |
| --- | --- | --- |
| Log in with your browser | Chrome or Edge on a computer | Recommended |
| Import devices.json | The homeconnect-profile-downloader tool | If the browser login doesn't work for you |

## Log in with your browser

After you log in, Home Connect sends your browser to an address that starts with `hcauth://`. Browsers can't open that address, so the page appears to hang or shows an error. The address contains the code the app needs. You copy it from the browser's developer tools.

1. On your computer, open [my.homey.app](https://my.homey.app) > Apps > Home Connect > Settings.
2. Open a **new tab** in Chrome or Edge and open the developer tools:
   - Windows and Linux: **F12** or **Ctrl+Shift+I**
   - Mac: **fn+F12** or **⌥⌘I**
   - Chromebook: **Ctrl+Shift+I** (Chromebooks have no F12 key)
3. Go to the **Network** tab and tick **Preserve log**. Without it, the log is cleared when the page redirects.
4. In the app settings, press **Create login link**, copy the link and open it in the tab with the developer tools.
5. Log in with your SingleKey ID. When the page hangs or shows an error, that is expected.
6. Type `hcauth` in the filter of the Network tab. Click the red or failed request and copy the **Request URL**. It starts with `hcauth://auth/prod?code=`.
7. Paste it in the app settings under **Address after logging in** and press **Pair**.

The app shows how many appliances it found. Continue with [Adding appliances](adding-appliances.md).

{% hint style="info" %}
The code in the address is only valid for a short time. If pairing fails with an expired or mismatched code, create a new login link and start again.
{% endhint %}

### Which browsers work

| Browser | Status |
| --- | --- |
| Chrome, Edge (Windows, macOS, Linux) | Works, confirmed by testers |
| Brave, Opera, Arc | Built on Chromium, expected to work, not tested |
| Chromebook | Works if the developer tools are allowed. On a school or work Chromebook an administrator may have turned them off. |
| Firefox | Doesn't show the `hcauth://` request in the Network tab. Use Chrome or Edge. |
| Safari | Not tested. Use Chrome or Edge. |
| Any browser on a phone or tablet | Doesn't work: there are no developer tools |

## Import devices.json

The [homeconnect-profile-downloader](https://github.com/bruestel/homeconnect-profile-downloader/releases) is a small app for Windows, macOS and Linux that logs in to Home Connect and saves your appliance profiles.

1. Download and start the profile downloader.
2. Log in with your SingleKey ID.
3. Choose the **hcpy** profile and save the `devices.json` file.
4. In the app settings, open the **devices.json** tab, choose the file (or paste its contents) and press **Import appliances**.

{% hint style="danger" %}
`devices.json` contains the keys of your appliances. Don't share it, and never post the `key` or `iv` values in the forum or in an issue.
{% endhint %}

## Refreshing later

Bought a new appliance? Add it to your Home Connect account in the official app first, then press **Refresh appliances** in the app settings. The app fetches the list again with the saved login. If you paired by importing `devices.json`, import a new file instead.
