# FleetAnchor Pro — User Navigation Guide

**For:** All Users (Workshop Staff, Vendors, Field Agents)  
**Version:** 1.0

---

## Getting Started

### Logging In

1. Go to your FleetAnchor Pro URL
2. Enter your **email address** and **password**
3. If your account has 2FA enabled, enter the 6-digit code from your authenticator app
4. You will be redirected to the correct dashboard based on your role

**Forgot your password?**
1. Click **"Forgot password?"** on the login page
2. Enter your registered email address
3. Select your account type from the dropdown
4. Check your email for a 6-digit OTP code (valid for 15 minutes)
5. Enter the code and set your new password
6. You will be automatically logged in

---

## Workshop Admin Dashboard

*For: Super Admin, OEM Admin, Workshop Staff*

### Dashboard (Home)

The dashboard gives you a real-time overview of your fleet operations.

**What you see:**
- **Active Jobs** — total jobs currently in progress
- **In Repair Bay** — vehicles currently being repaired
- **Completed This Month** — jobs completed in the current month
- **Revenue MTD** — total invoiced revenue this month

**Recent Jobs table** — shows the latest job requests with status badges:
- 🟡 **Pending** — waiting for diagnosis or estimate
- 🔵 **Approved** — estimate approved, repair not started
- 🟣 **In Repair** — vehicle currently being worked on
- 🟢 **Completed** — repair done, awaiting payment
- 🔴 **Queried** — vendor has raised a question on the estimate

Click any job row to open the job detail view.

**Revenue Chart** — shows the last 6 months of revenue as a bar chart.

**Repair Bay Status** — live progress bars for each active repair bay showing percentage completion.

---

### Job Requests

**Finding a job:**
- Use the tabs to filter: All / Pending Estimate / In Repair / Completed
- Click any row to see the full job details on the right panel

**Job Detail Panel shows:**
- Vehicle VIN and plate number
- Vendor company and contact
- Assigned technician
- Estimate amount
- Full timestamped timeline of every action

**Updating a job status:**
1. Open the job detail
2. Click **"Mark Complete"** when repair is finished
3. The vendor is automatically notified by email
4. Generate an invoice using the **"Invoice"** button

**Sending an estimate:**
1. Go to **Estimates** tab on the job
2. Enter parts cost and labour cost separately
3. Add notes if needed
4. Click **Send Estimate** — vendor receives an email notification immediately

---

### VIN Scanner

The VIN scanner lets you look up any vehicle's full maintenance history instantly.

**How to scan:**
1. Click **VIN Scanner** in the sidebar
2. Type a VIN, chassis number, or plate number in the search box
3. Click **Simulate Scan** or press Enter
4. The vehicle information card appears on the left
5. Full maintenance history appears on the right

**Cost visibility toggle:**
- The **"Show cost"** toggle at the top controls whether ₦ amounts are visible
- Turn it **OFF** before exporting for audit-clean reports (costs are hidden)
- Field agents always see costs as hidden regardless of this toggle

**Exporting history:**
1. Search for the vehicle
2. Set the cost toggle as needed
3. Click **Export PDF/CSV**
4. The file downloads with or without cost columns

---

### Active Repairs

Shows all vehicles currently in repair bays.

**Each bay card shows:**
- Bay number
- Vehicle VIN and job type
- Technician assigned
- Progress bar (percentage complete)
- Estimated hours remaining

**Marking a repair complete:**
1. Click **"Mark Complete"** on the bay card
2. The job status updates to COMPLETED
3. The vendor receives an automated completion notification
4. The bay becomes available for a new vehicle

---

### Vehicles Registry

Full list of all registered vehicles across your fleet.

**Search and filter:** Use the search bar to find by VIN, plate number, or vendor name.

**Adding a new vehicle:**
1. Click **+ Add Vehicle** button (top right)
2. Fill in: VIN/Chassis, Plate Number, Engine Number, Make, Model, Year
3. Select the vendor this vehicle belongs to
4. Click Save

**Quick scan:** Click the scan icon on any row to instantly view that vehicle's full history in the VIN Scanner.

---

### Vendors & OEM Partners

Overview of all companies that bring fleets to your workshop.

**Vendor card shows:**
- Fleet size (total registered vehicles)
- Active jobs count
- Year-to-date spend
- Subscription plan (Growth or Enterprise)

**Suspending a vendor:**
1. Click on the vendor card
2. Click **Suspend Account**
3. Enter the reason for suspension
4. The vendor receives an email notification
5. All vendor users lose access immediately

**Reinstating a vendor:**
1. Find the suspended vendor
2. Click **Reinstate**
3. Access is restored immediately

---

### Invoices & Costs

**Generating an invoice:**
1. Job must be in COMPLETED status
2. Go to **Invoices** in the sidebar
3. Click **+ Generate Invoice**
4. Select the completed job
5. Invoice is created automatically from the approved estimate

**Confirming payment:**
1. Find the invoice with PENDING status
2. Click **Confirm Payment**
3. Enter the Paystack reference number (optional)
4. Invoice status changes to PAID
5. Vendor receives payment confirmation email

**Downloading invoices:**
- Click the **PDF** button on any invoice row
- The invoice downloads as a formatted PDF
- Use the cost toggle to generate audit-clean versions

---

### Analytics

**Dashboard KPIs:**
- Average resolution time (how long jobs take from submission to completion)
- Cost per vehicle (average maintenance cost across fleet)
- Jobs this month vs previous month
- Top repair category (engine, brakes, transmission, etc.)

**Top 5 vehicles by maintenance cost** — identifies vehicles that may need replacement.

**Jobs by category** — pie chart breakdown of repair types.

**Monthly revenue** — 6-month trend chart.

**Exporting reports:** Click **Export Report** to download the analytics summary as PDF.

---

### Subscriptions & Billing

**Viewing active subscriptions:**
- Table shows all vendor subscriptions with renewal dates and status

**Subscription statuses:**
- 🟢 **Active** — subscription current
- 🟡 **Expiring** — expires within 7 days (warning sent to vendor)
- 🔴 **Suspended** — expired and vendor account suspended

**Renewing a vendor subscription:**
1. Find the expiring/expired vendor
2. Click **Renew**
3. Paystack payment link is generated
4. Vendor completes payment
5. Subscription automatically reactivated via webhook

**Plans:**
- **Growth** — ₦85,000/month — up to 10 vendors, 250 vehicles, 2 users per vendor
- **Enterprise** — ₦250,000/month — unlimited everything

---

### Settings

**Paystack Configuration:**
1. Enter your Paystack Secret Key
2. Enter your receiving bank account name, number, and bank
3. Click **Save** — all subscription payments auto-deposit to this account

**Notification Settings:**
Toggle on/off for each notification type:
- Job completion alerts
- Payment received
- Subscription expiry (7 days)
- Subscription expiry (3 days)
- New job request received
- Estimate queried by vendor

---

### Audit Log

The audit log records every action performed on the platform.

**Each log entry shows:**
- Exact timestamp
- Username who performed the action
- What action was taken (e.g., "Job marked complete", "Estimate approved")
- Which entity was affected (job ID, vehicle VIN, etc.)
- IP address of the user

**Exporting the audit log:**
1. Click **Export Audit PDF**
2. Toggle "Include cost in export" as needed
3. The full log downloads as CSV or PDF

**This log is tamper-proof** — it cannot be edited or deleted, even by the Super Admin.

---

## Vendor Portal

*For: Fleet Managers, Maintenance Supervisors, Field Agents*

### Vendor Dashboard

Shows an overview of your fleet's maintenance status.

**Stats:**
- Your total registered vehicles
- Active jobs (jobs currently in progress at the workshop)
- Vehicles in repair right now
- Year-to-date maintenance spend

**Pending Approval table** — jobs where the workshop has sent an estimate waiting for your approval.

**Recently Completed** — vehicles ready for pickup.

---

### My Job Requests

**Submitting a new job:**
1. Click **+ New Request**
2. Select the vehicle from your fleet
3. Choose the issue category (Engine, Brakes, Transmission, etc.)
4. Describe the complaint in detail
5. Submit — the workshop receives an instant notification

**Responding to an estimate:**
When the workshop sends an estimate, you receive an email. To respond:
1. Go to **My Job Requests**
2. Find the job with **"Approve Estimate"** status
3. Click **Approve** to authorise repairs to begin
4. Or click **Query** and type your question/concern

---

### VIN Scanner (Vendor)

Works the same as the workshop scanner but costs are visible only to Fleet Managers and Maintenance Supervisors.

**Field Agents** see the same scanner but cost fields show as "Hidden — admin only".

---

### My Fleet (Vehicles)

List of all vehicles registered under your company.

**Registering a vehicle:**
1. Click **+ Add Vehicle**
2. Enter VIN, plate number, engine number, make, model, year
3. Submit for OEM Admin approval

**Quick scan:** Click the scan icon on any vehicle to instantly see its full history.

---

### Maintenance History

View the complete maintenance history for any vehicle.

**To view history:**
1. Click **Maintenance History** in the sidebar
2. Type a VIN or plate number in the search box
3. Full history appears with dates, work done, technician, and status

**Exporting history:**
- Viewing is free — no subscription required
- **Exporting as PDF/CSV requires a Growth or Enterprise subscription**
- The export gate banner shows the upgrade option

---

### Team Members

Manage the users in your vendor account.

**Growth plan limit: 2 users maximum**

**Adding a team member:**
1. Click **+ Add User**
2. Enter their name, email, and select their role
3. They receive a welcome email with a temporary password
4. They must change their password on first login

**User roles:**
- **Fleet Manager** — full access to all vendor features
- **Maintenance Supervisor** — manages jobs and estimates, no cost export
- **Field Agent** — can scan VINs on the field only, no cost data

**Suspending a user:**
Click the Suspend button next to any team member to immediately revoke their access.

**Upgrading for more users:**
Click **Upgrade to Enterprise** to remove the 2-user limit.

---

### Subscription

View your current plan, billing history, and upgrade options.

**Downloading invoices:**
Click the download icon on any billing history row to get your subscription receipt.

**Upgrading:**
1. Click **Upgrade via Paystack**
2. Complete payment on the Paystack checkout page
3. Your plan upgrades immediately after payment confirmation

---

## Tips & Best Practices

**For Workshop Staff:**
- Always add detailed notes when sending estimates — vendors approve faster
- Use the Bay Status cards to avoid double-booking repair bays
- Export the audit log monthly as a backup record

**For Fleet Managers:**
- Register all vehicles before submitting job requests
- Approve or query estimates within 24 hours to avoid delays
- Check the Maintenance History before approving major repairs to spot repeat issues

**For Field Agents:**
- Always scan the VIN barcode rather than typing — reduces errors
- Submit job complaints with as much detail as possible — photos can be added in the description
- If a vehicle is not found in the system, contact your Fleet Manager to register it

---

## Getting Help

If you encounter any issues:
- Check your email for system notifications
- Contact your OEM Admin or Workshop Manager
- For account suspension issues, email support with your company name and vendor ID
- For billing issues, contact through the Subscription page
