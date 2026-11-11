# Admission Enquiry Tracker – Setup Guide

There are three parts. Each one builds on the one before it:

| Part | What you get | Time |
|---|---|---|
| **A. GitHub Pages** | The tracker and the parent form are online at your own web address. Staff can use it on any computer or phone. | 10 min |
| **B. Google Sheet** | One shared live database, **staff logins with access roles**, an **activity log**, online-form enquiries saved automatically, and a 7 AM email to each counsellor. | 15 min |
| **C. Go live** | QR codes, Instagram/Facebook links, and phones set up as apps. | 5 min |

> **Privacy first.** GitHub Pages websites are public, so only the *program* goes on GitHub.
> Parents' data lives in your private Google Sheet, or in the browser, and is **never** uploaded to GitHub.
> The `.gitignore` file already blocks `seed-data.js`, Excel files and backups. Don't remove it.

---

## A. Put the tracker online with GitHub Pages

1. Go to <https://github.com> and sign in, or create a free account.
2. Click **+ → New repository**.
   - Name: `enquiry` (or any name you like).
   - Visibility: **Public**. Free GitHub Pages needs this, and it's safe because the code holds no data.
   - Click **Create repository**.
3. Click **uploading an existing file** and drag in these files:
   `index.html`, `app.js`, `enquiry.html`, `manifest.json`, `sw.js`, `icon.svg`, `.gitignore`, `SETUP.md`
   - ❌ **Do NOT upload `seed-data.js`.** It contains your parents' phone numbers.
   - The `apps-script` folder doesn't need to be uploaded. Its code goes into Google (Part B).
4. Click **Commit changes**.
5. Open **Settings → Pages**. Under *Branch*, choose **main** and **/ (root)**, then click **Save**.
6. Wait about 1 minute. Your addresses will be:
   - Tracker: `https://YOUR-USERNAME.github.io/enquiry/`
   - Parent form: `https://YOUR-USERNAME.github.io/enquiry/enquiry.html`

> Your existing 42 enquiries are stored in the browser on the computer where you first opened the tracker locally.
> To move them online, **connect the Google Sheet (Part B) from that same computer first**. It will offer to upload them.
> Alternatively, on that computer go to **Settings → Download backup**, then on the new site go to **Settings → Restore backup**.

---

## B. Create the shared database (Google Sheet)

Use the school's Google account, e.g. admissions@yourschool.com, so the data belongs to the school.

1. Go to <https://sheets.new> to create a new Google Sheet. Name it **Admission Enquiries**.
2. Click **Extensions → Apps Script**.
3. Delete everything in the editor. Then open the file `apps-script/Code.gs` from this folder, copy all of it and paste it in. Click 💾 **Save**.
4. Click **⚙ Project Settings** (left side). Set **Time zone** to your local zone, e.g. *(GMT+04:00) Dubai*.
5. Go back to **Editor** (`< >` icon). In the function dropdown at the top, choose **setup**, then click **▶ Run**.
   - Google will ask for permission: **Review permissions → choose your account → Advanced → Go to project (unsafe) → Allow**.
     Google shows this warning for every new script. The script is yours and only touches this one spreadsheet, plus sending reminder emails.
   - When it finishes, open **Execution log** and copy the **SETUP KEY**. You need it only once, to create the first administrator.
6. Click **Deploy → New deployment**.
   - Click ⚙ next to *Select type* → **Web app**.
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**. This lets the parent form submit enquiries. Everything else requires staff to sign in.
   - Click **Deploy** and copy the **Web app URL** (it starts with `https://script.google.com/macros/s/…/exec`).
7. **Create the administrator.** In the tracker, go to **Settings → Shared database & sign-in**, paste the **Web app URL** and click **Connect**.
   Enter the **setup key**, your name, a user name and a password (8+ characters).
   - Do this on the computer that has your existing data, and choose **OK** when asked to upload it.
8. **Add your staff.** Go to **Settings → Users & access roles → + Add user**. For each person, enter their name, a user name, a role, their WhatsApp number, email and a temporary password.
   Give each person their user name and temporary password. They can change it under **My account**.
9. **On every staff computer or phone:** open the tracker address. The first time only, go to **Settings**, paste the Web app URL and click **Connect**. Then sign in.

### Access roles

| Role | Can do |
|---|---|
| **Admin** | Everything: users, settings, import, export, delete, reports, activity log |
| **Manager** | See all enquiries, assign, reports, activity log, export, delete. Cannot manage users or settings. |
| **Counsellor** | Sees only enquiries **assigned to them** plus unassigned ones. Can add enquiries, follow up, book visits and send WhatsApp messages. Cannot delete, export or reassign to others. |
| **Reception** | Captures enquiries, sees all enquiries (to spot repeats), books visits, assigns to counsellors. Cannot delete, export or see reports. |

The Google script checks these rules on every request, so they can't be bypassed from the browser.
Passwords are stored only as salted hashes. Five wrong passwords lock that user name for 15 minutes.

### Activity log

Every action is recorded in the **Activity** sheet: sign-ins and failed attempts, enquiries added or edited, follow-ups, stage changes, assignments, visits, WhatsApp messages, exports, deletions, user changes and settings changes. Each entry has the person, time and details.
Admins and Managers see it in the tracker under **Activity log**, and can filter and export it. Only the script writes to this sheet.

### If someone leaves or loses their phone

- **Settings → Users → Edit → Status: Disabled.** They are signed out everywhere on their next request.
- To sign everyone out, run **signOutEveryone** in Apps Script.
- If all administrators are locked out, open **resetAdminPassword** in Apps Script. Edit the user name and new password at the top, then run it.

### Turn on the online form

Open `enquiry.html` (on GitHub: click the file → ✏️ edit). In the **FORM SETTINGS** block at the top, fill in:

```js
school:   "Your School Name",
apiUrl:   "https://script.google.com/macros/s/…/exec",   // the Web app URL from step 6
whatsapp: "971501234567",                               // school WhatsApp, digits only (backup route)
hrEmail:  "hr@yourschool.com",
classes:  [...],  academicYears: [...]
```

Then click **Commit changes**. New form submissions appear in the tracker within a minute, and as a desktop notification if reminders are on.

### Daily 7 AM emails and new-enquiry alerts

- Every active user (except Reception) who has an **email** in **Settings → Users** gets a 7 AM email with their overdue follow-ups, today's follow-ups and visits.
  Leads that are not assigned to anyone go to the first **Counsellor**.
- In **Settings → Online enquiry form**, set **Email alert for new online enquiries** to receive an email the moment a parent submits the form.

### If you change Code.gs later

Go to **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The web app URL stays the same.

---

## C. Go live

1. **Each staff member** signs in with their own user name and password. Their actions are recorded under their name, and counsellors see only their own leads.
2. **QR codes and ad links:** in **Settings → Online enquiry form & QR codes**, paste the form address
   (`https://YOUR-USERNAME.github.io/enquiry/enquiry.html`). Choose a source and campaign, then click **Download QR**.
   Use a separate QR or link for each poster, banner or ad. Reports will then show which ones bring admissions.
   - Instagram/Facebook bio: choose source *Instagram*, click **Copy link**, and paste it in your bio.
3. **Phones:** open the tracker address in Chrome (Android) or Safari (iPhone), then tap **Share/⋮ → Add to Home screen**.
4. **Reminders on office computers:** go to **Dashboard → Turn on reminders** and allow notifications.
5. **Seats:** open **Seats** and enter the number of seats for each class.

---

## Everyday tips

- Make changes in the **tracker**, not directly in the Google Sheet. The sheet is the storage, and its visible columns are only for viewing and filtering.
- **Paste enquiry** (top-right): paste any WhatsApp, Instagram or email enquiry, and the name, phone, children and classes are filled in automatically.
- If the internet drops, the tracker keeps working. Changes upload automatically when the connection returns. The sidebar shows **Synced / Offline**.
- Make an occasional **Settings → Download backup** for safety.
- **On shared office computers, always Sign out** (Settings or the More menu). Signing out removes the enquiry data from that device.
