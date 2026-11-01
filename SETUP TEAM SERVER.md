# Set up the REDEFINE team server

You do this once, in about 15 minutes. It gives the app its Claude access, team sign-in and shared forms.

Your Claude API key stays in Google. Never paste it into chat, email or this repo.

## 1. Get a Claude API key

1. Go to https://console.anthropic.com and sign in. This account is separate from your Claude chat plan.
2. Under **Billing**, add a payment method and some credit. Turn off auto-reload at first so spending has a ceiling.
3. Under **API keys**, create a key and copy it.

## 2. Create the server

1. Go to https://script.google.com and click **New project**. Name it `REDEFINE Form Filler`.
2. Delete the sample code. Open `server/Code.gs` from this folder, copy all of it, paste it in, and click Save.
3. Click **Project Settings** (the gear icon). Under **Script properties**, add these:

| Property | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the key from step 1 |
| `TEAM_CODE` | a code for your agents, at least 10 characters |
| `OWNER_CODE` | a different code for you only; it can remove any form |
| `DAILY_LIMIT` | `300` (the most Claude calls the team can make per day) |

4. Go back to **Editor**, choose the `setup` function at the top, and click **Run**. Approve the Google permissions it asks for. Google may warn the app is unverified; choose **Advanced**, then continue. It is your own script.

## 3. Publish the server

1. Click **Deploy**, then **New deployment**, then the gear icon, then **Web app**.
2. Set **Execute as** to **Me**.
3. Set **Who has access** to **Anyone**. The team code is what keeps others out.
4. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.

## 4. Send me the URL

Paste the `/exec` URL into our chat. It isn't secret. I'll connect the app and tell you when it's ready.

## Later changes

- **Change the team code:** edit `TEAM_CODE` in Script properties. Everyone signs in again.
- **Change the daily limit:** edit `DAILY_LIMIT`.
- **Use a cheaper model:** add a property `MODEL` with the value `claude-sonnet-5-5`.
- **After changing `Code.gs`:** Deploy, Manage deployments, edit, New version. The URL stays the same.
- **Shared forms** are in the Google Drive folder `REDEFINE Form Filler Data`. Don't delete or rename it.
