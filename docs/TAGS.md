# TAGS – Listing Agent Call #1

This file defines the logical tags used in the Listing Agent – Call #1 workflow.  
These tags are stored in the workflow state and/or database and should be treated as boolean or timestamped flags.

---

## Tag A – Client Package Prepared

- **Meaning:** Full client documentation package is already collected and verified.
- **Set When:** Rental specialist or intake workflow marks the client as fully packaged before this call.
- **Used For:** Enables the “Position Client Favourably” script:
  - Present credit report, employment letters, NOAs, references, bank statements, etc.
  - Ask if the landlord or listing agent needs anything else.

---

## Tag B – Additional Offer Criteria

- **Meaning:** Listing agent has specified additional offer requirements beyond the standard package.
- **Set When:** During the positioning step, the agent lists extra criteria (e.g., specific income thresholds, move-in dates, guarantor requirements).
- **Used For:**
  - Extend the Property Offer Requirements for the property/properties.
  - Inform later offer-prep workflows about non-standard conditions.

---

## Tag C – Wait for Offer Outcome

- **Meaning:** Listing agent has advised that the landlord is reviewing an offer and that we should wait for the outcome before proceeding with the showing.
- **Set When:** In the offers/irrevocability dialogue, the agent effectively says “wait for outcome” instead of proceeding with the showing.
- **Used For:**
  - Move showing(s) into a Pending category.
  - Status: “Temporarily Unavailable – Landlord Reviewing Offer”.
  - Cancel or pause existing showing bookings and adjust the route plan.

---

## Tag D – Blocking Brokerage / Client Remark

- **Meaning:** There is a remark in the Client or Brokerage Remarks sections that could block or significantly affect the showing.
- **Set When:** The property record contains such a remark and it has not yet been fully processed for this showing batch.
- **Used For:**
  - Trigger questioning about the remark and whether the issue has been/will be resolved.
  - Decide whether to cancel, proceed, or mark as “Under Review by Group”.

---

## Tag E – Agent Needs Time (Pets or Other)

- **Meaning:** Listing agent needs additional time to confirm whether a condition (typically pet policy) is acceptable.
- **Set When:** Agent explicitly says they need to check with landlord or tenants (e.g., about a specific pet).
- **Used For:**
  - Mark property as temporarily unavailable due to pending confirmation.
  - Combine with Tags F and G to define follow-up behaviour.

---

## Tag F – Agent Will Follow Up

- **Meaning:** Listing agent has committed to proactively follow up with the answer (e.g., pet decision).
- **Set When:** In the Tag E conversation, agent says they will get back to us.
- **Used For:**
  - Schedule a passive wait until the agent’s promised window.
  - Avoid spammy follow-ups from our side during that window.

---

## Tag G – We Must Follow Up

- **Meaning:** We are responsible for following up with the listing agent at a specific time.
- **Set When:** Agent asks us to call/text back at a given time to get an answer (usually after Tag E).
- **Used For:**
  - Schedule a follow-up task/call at the proposed time.
  - Decide whether holding the slot harms the broader showing schedule:
    - If harmful and time is far out → mark as temporarily unavailable + re-route.
    - If not harmful or time is soon → keep as pending without fully releasing.

---

## Tag H – Pets Outcome Still Unknown at Follow-up

- **Meaning:** After the pets follow-up call, the agent still does not have a clear answer.
- **Set When:** Follow-up call for pets (or similar condition) results in “still waiting” / “need more time”.
- **Used For:**
  - Cancel the immediate showing slot to free schedule.
  - Mark as:
    - Category: Pending Showings.
    - Status: “Temporarily Unavailable – Listing Agent needs more time to confirm if Pets are Allowed”.

---

## Tag J – Under Review by Group

- **Meaning:** Property is under internal review by the client group or due to complex brokerage/client remarks and is not yet fully cleared for showing.
- **Set When:**
  - Remarks discussion leads to a “maybe” outcome.
  - Additional internal or tenant-level actions are required before confirming the showing.
- **Used For:**
  - Category: Pending Showings.
  - Status: “Under Review by Group”.
  - Trigger the “Brokerage Remarks to be Addressed by Tenant” workflow.
  - Modify pets logic:
    - If pets are allowed but Tag J exists, still keep the property under group review instead of fully confirming.

