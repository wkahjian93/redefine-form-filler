# Set up the REDEFINE team server

You do this once, in about 15 minutes. It gives the app its AI access, team sign-in and shared forms.

Your OpenAI API key stays in Google. Never paste it into chat, email or this repo.

## 1. Get your OpenAI API key

You can reuse the key from your other app, or create a new one for clearer spending and safer control.

1. Go to https://platform.openai.com and sign in.
2. Under **Billing**, check the account has credit.
3. To create a new key, go to **API keys**, click **Create new secret key**, and copy it. It starts with `sk-`.

## 2. Create the server

1. Go to https://script.google.com and click **New project**. Name it `REDEFINE Form Filler`.
2. Delete the sample code. Open `server/Code.gs` from this folder, copy all of it, paste it in, and click Save.
3. Click **Project Settings** (the gear icon). Under **Script properties**, add these:

| Property | Value |
|---|---|
| `OPENAI_API_KEY` | the key from step 1 |
| `TEAM_CODE` | a code for your agents, at least 10 characters |
| `OWNER_CODE` | a different code for you only; it can remove any form |
| `DAILY_LIMIT` | `300` (the most AI calls the team can make per day) |

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
- **Change the AI model:** add a property `MODEL`. The default is `gpt-6.1-terra`. `gpt-6-luna` is cheaper; `gpt-6.1-sol` is stronger for hard photos.
- **After changing `Code.gs`:** Deploy, Manage deployments, edit, New version. The URL stays the same.
- **Shared forms** are in the Google Drive folder `REDEFINE Form Filler Data`. Don't delete or rename it.
