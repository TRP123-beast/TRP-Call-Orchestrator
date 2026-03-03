# Listing Agent – Call #1 (Outbound)

**AI Agent Name:** `[AI_AGENT_NAME]`  
**Company:** Nestr Realty  
**Channel:** Outbound phone (plus follow-up via text where specified)

This document is the detailed conversational spec for the “Listing Agent – Call #1 (Outbound)” workflow shown in the Whimsical diagrams.  
Implementation overview lives in `WORKFLOW.md`. Tag definitions: `docs/TAGS.md`. System status mappings: `docs/SYSTEM_UPDATES.md`.

---

## 1. Pre-call Batching

- Take the input list of properties scheduled for showing.
- Group properties by listing agent.
- For each listing agent group:
  - Aggregate property addresses into a single reference list.
  - Load the listing agent record, brokerage, assistant (if known), and existing Tag state.

---

## 2. Initial Call Script

Primary script:

> “Hi [Listing Agent name]. This is [AI Agent name], from Nestr Realty. How are you? I wanted to connect about your listing(s) at [property address(es)]. Is/are the property/properties still available?”

Branch on outcome:

- No response (no answer, voicemail, call fails) → go to **3. No Response Path**.
- Agent answers and engages → go to **4. Direct Response Path**.

---

## 3. No Response Path

1. Wait 20 minutes.
2. Re-attempt call to listing agent or known assistant.
3. If no answer / voicemail / busy:
   - Check if we have already spoken to the brokerage for this listing in the current workflow context.
   - If yes:
     - Wait another 20 minutes; optionally schedule a retry window or fall back to text where configured.
   - If no:
     - Place a call to the brokerage.

### 3.1 Brokerage Call – Script

Intro:

> “Hi, my name is [AI Agent name] and I work with Nestr. How are you?”  
> “[Name], I'm calling in regards to your listing(s) at [property address(es)]. We have been unable to reach the Listing Agent. We believe his/her name is [Listing Agent name]. Is that correct?”

Branch:

- **If brokerage confirms listing agent is correct:**
  - Ask:
    - “Does [Listing Agent name] have an assistant?”
  - If yes:
    - “What is the name and contact information of [Listing Agent name]’s assistant?”
    - Store assistant name and contact details.
  - Then ask for availability (Section 3.2).

- **If brokerage says our info is wrong:**
  - Clarify:
    > “That’s unfortunate. My apologies. According to the listing on the MLS, it shows that the Listing Agent is: [our listing agent info]. Is that not correct?”
  - If brokerage confirms we are wrong:
    - Confirm address:
      > “Okay, just to confirm, we are both looking at and speaking about [property address], correct?”
    - Ask for corrected listing agent info:
      > “What is the name and contact information of the Listing Agent?”
    - Ask if the new listing agent has an assistant:
      > “Does [Listing Agent name] have an assistant?”
    - If yes:
      > “What is the name and contact information of [Listing Agent name]’s assistant?”
    - Persist all new contact details.

### 3.2 Brokerage – Property Availability Questions

Ask:

> “Is the property (are the properties) still available?”

Branch:

- **Yes – at least one property is still available:**
  - Ask:
    > “Are you aware of any offers or updates on the property/properties?”
  - If brokerage knows and there are offers:
    - Ask irrevocability questions (same as Section 5.1).
  - If brokerage does not know:
    - Treat as “availability known but offers unknown”; keep showing but flag for follow-up at listing agent level.

- **None are available / brokerage confirms not available:**
  - Close:
    > “Ok [name], thank you for your time and information, all the best and catch you on the next one.”
  - Apply system updates:
    - Cancel showing(s).
    - Category: Canceled Showings.
    - Status: “Unavailable – Tenanted”.
    - Release rental specialist.
    - Run “Showings Route Plan – Final”.

---

## 4. Direct Response Path (Listing Agent)

If the listing agent responds (phone or text) to the initial outreach:

### 4.1 Availability Confirmation

First, confirm availability:

- If **at least one property is available**:
  - Ask:
    > “Are you available for a quick call or would you prefer we continue this convo via text?”
  - Branch:
    - No response → wait 20 minutes, then retry or fall back to brokerage path if fully unresponsive.
    - Prefers phone call → Section 4.2.
    - Prefers text → handle entire logic via text; reuse content from Sections 5 and 6 but as SMS.

- If **all properties are NOT available**:
  - Close:
    > “Ok [Agent name], thank you for your time and information, all the best and catch you on the next one.”
  - Then:
    - Cancel showing(s).
    - Category: Canceled Showings.
    - Status: “Unavailable – Tenanted”.
    - Release rental specialist.
    - Run “Showings Route Plan – Final”.

### 4.2 Scheduling the Call

If they prefer phone:

> “Can I call you now, or do you prefer another time?”

Branch:

- **Call now:**
  - Wait ~10 seconds and then dial.
  - Run Section 5 (Deep Call Flow) once connected.

- **Listing agent proposes a time:**
  - If proposed time is **more than 1 hour away**:
    - > “Okay thanks [Listing Agent name]. What’s your email? I’ll send you a calendar invite.”
    - When email is provided:
      - Update records with the email.
      - Send calendar invite for the proposed time.
      - Confirm:
        > “Speak to you at [time]. Looking forward to it.”
      - Wait until proposed time and call; then run Section 5.
  - If proposed time is **within 1 hour**:
    - Optionally confirm by text.
    - Wait until proposed time and call; then run Section 5.

- **Listing agent does not propose a time:**
  - > “Are you available in 20 minutes?”
  - If yes:
    - > “Okay, perfect. Speak to you soon.”
    - Wait 20 minutes and call; then run Section 5.
  - If no and they suggest a new time:
    - Handle like “proposed time” above.
  - If no and they still do not propose a time:
    - > “Okay, when’s the next best time for us to connect and discuss this?”
    - Once they provide a time, handle as above (more than 1 hour vs less than 1 hour).

---

## 5. Deep Call Flow – Offers & Client Positioning

Once on a call (agent answers scheduled or immediate call):

Intro:

> “Hi, [Agent name], my name is [AI Agent name] and I work with Nestr. How are you?”  
> “I'm calling in regards to your listing(s) at [property address(es)].”

### 5.1 Property Availability (If Not Already Settled)

If availability has not been confirmed earlier:

> “Is/are the property/ies still available?”

Branch:

- Yes – at least one available:
  - Continue with offers and positioning (Sections 5.2–5.4).
- None available:
  - Same handling as Section 3.2 / 4.1 “none available” (cancel, status updates, route plan).

### 5.2 Registered Offers / Irrevocability

Two entry conditions:

- **Registered offer(s) exist on MLS:**
  - > “I understand that there is/are currently (an) offer(s) in hand.”

- **Registered offer not visible on MLS:**
  - > “Do you currently have any offers in hand for this property? Has anyone expressed an interest in submitting one yet?”

If offers exist and Tag E does not already exist:

> “When was the offer received?”  
> “What is/are the irrevocability time(s) on the offer(s)?”  
> “Is the Landlord strongly considering the offer(s)?”  
> “Is there a point in our client coming to visit the property at the scheduled time, or should we wait for the outcome of the registered offer before re-booking?”

Branch:

- **Wait for outcome (Tag C):**
  - Close:
    > “Ok [Agent name], thank you for your time and information. We are going to cancel the showing for now, but may re-book it again if it becomes available.”
  - System:
    - Cancel showing.
    - Category: Pending Showings.
    - Status: “Temporarily Unavailable – Landlord Reviewing Offer”.
    - Release rental specialist; run “Showings Route Plan – Final”.

- **Proceed with booking:**
  - Continue with Sections 5.3 and 6.

### 5.3 Client Positioning (Tag A / Tag B)

If Tag A exists (pre-collected client package):

> “[Agent name], to be proactive, as our client(s) is/are (employed, retired, student, unemployed, self-employed, guarantor, co-signer, main applicant) we have gone ahead and collected the necessary documentation which includes their/his/her (credit score and report, employment letter(s), rental application form, NOA, T5, references, pay stubs, bank statements, etc). In the event they are interested in submitting an offer, is there anything else you and/or your client would require?”

Branch:

- If listing agent adds further criteria:
  - Set **Tag B**.
  - Persist criteria to Property Offer Requirements (see `docs/SYSTEM_UPDATES.md`).
  - Then continue (Section 6).
- If listing agent does not add further criteria:
  - Proceed directly to pets/remarks (Section 6).

If Tag A does not exist:

- Skip the full positioning script or run a shortened variant; still ask whether there is anything else the landlord would require.

---

## 6. Pets and Remarks

### 6.1 Pets

Initial question:

> “[Agent name], would your client/the landlord still be open to considering my client(s) if he/she/they had a (describe pet – type, breed, size)?”

Branch:

- **Pets explicitly not allowed:**
  - Close:
    > “Ok [Agent name], thank you for your time and information, all the best and catch you on the next one.”
  - System:
    - Cancel showing.
    - Category: Canceled Showings.
    - Status: “Unavailable – No Pets Allowed” or “Unavailable – No Pets”.
    - Update property records: “Pets NOT Allowed”.
    - Release rental specialist; run “Showings Route Plan – Final”.

- **Listing agent needs time to find out (Tag E):**
  - Set Tag E.
  - Ask:
    > “Is there anything else we need to know about the property?”  
    > “Will you let me know about the pets, or should I follow up in an hour?”
  - If agent will let us know:
    - Set Tag F.
    - Track promised follow-up time.
  - If we should follow up:
    - Set Tag G with proposed follow-up time.
  - If the proposed follow-up time is far enough out that it would block the schedule and negatively affect routing, mark showing as:
    - Category: Pending Showings.
    - Status: “Temporarily Unavailable – Listing Agent needs more time to confirm if Pets are Allowed”.
    - Release rental specialist and re-run “Showings Route Plan – Final”.

- **Pets allowed:**
  - If Tag J does not exist:
    - Close:
      > “Okay, thank you. We will proceed with the showing and I will let you know if my client(s) express(es) any interest to move forward with an offer.”
    - System:
      - Confirm rental specialist.
      - Update property records: “Pets Allowed”.
      - Run “Showings Route Plan – Final”.
  - If Tag J exists (under review due to brokerage/client remarks):
    - Same verbal close, but:
      - Category: Pending Showings.
      - Status: “Under Review by Group”.
      - Trigger “Brokerage Remarks to be Addressed by Tenant”.

### 6.2 Brokerage / Client Remarks (Tag D / Tag J)

When Tag D exists (there is a noteworthy remark):

> “Can you provide more detail regarding the [comment] made in the Client/Brokerage Remarks section?”

Then:

- Determine whether the problem has been resolved.
- If not resolved:
  - Check whether it can be resolved by reaching out to tenants.

Branch:

- **No – cannot be resolved / unacceptable:**
  - Close:
    > “Ok [Agent name], thank you for your time and information. Unfortunately, this won’t work for my client(s) so we will have to cancel the showing. All the best and catch you on the next one.”
  - System:
    - Cancel showing.
    - Category: Canceled Showings.
    - Status: “Unavailable – [insert broker/client remark]”.
    - Release rental specialist; run “Showings Route Plan – Final”.

- **Maybe – under review (Tag J):**
  - Set Tag J.
  - Close:
    > “Is there anything else we need to know about the property?”  
    > “Ok, [Agent name], thank you for your time. I will run this by my client(s) and we can connect again if they/he/she is/are interested in moving forward. In the meantime, please let me know if there are any changes or updates on the property.”
  - System:
    - Category: Pending Showings.
    - Status: “Under Review by Group”.
    - Trigger “Brokerage Remarks to be Addressed by Tenant”.

- **Yes – problem resolved:**
  - Close:
    > “Is there anything else we need to know about the property?”  
    > “Ok, [Agent name], thank you for your time. I will show the property to my client(s) and we can connect again if they/he/she is/are interested in moving forward. In the meantime, please let me know if there are any changes or updates on the property.”
  - System:
    - Confirm rental specialist.
    - Run “Showings Route Plan – Final”.

---

## 7. End-of-Call Conditions

The call ends when:

- All relevant availability / offers / pets / remarks issues are resolved for this agent’s properties, or
- Showings are cancelled or reclassified into a Pending state with a clear follow-up condition (Tag C, E, F, G, J), and
- The appropriate system updates described in `docs/SYSTEM_UPDATES.md` have been applied.

