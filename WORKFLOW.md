# TRP Call Orchestrator – Core Workflow

**Agent Type:** Listing Agent – Call #1 (Outbound)  
**AI Agent Name:** `[AI_AGENT_NAME]`  
**Company:** Nestr Realty

This file is the high-level, implementation-focused view of the Listing Agent Call #1 workflow.  
Detailed scripts live in `docs/listing-agent-call-1.md`.  
Tag semantics and status mappings live in `docs/TAGS.md` and `docs/SYSTEM_UPDATES.md`.

---

## 1. Entry Conditions

- Input: one or more properties to confirm.
- Batch by listing agent so a single conversation can cover all properties with the same agent.
- Preload:
  - Listing agent and brokerage info.
  - Any known assistant info.
  - Current showing records and property flags for this batch.

---

## 2. Initial Outbound Attempt

- Outbound phone call to listing agent.
- Script (compressed):
  - “Hi [Listing Agent name]. This is [AI Agent name] from Nestr Realty. I wanted to connect about your listing(s) at [property address(es)]. Is/are the property/properties still available?”

Outcomes:

- No answer / no response → go to **No Response Branch**.
- Agent answers (phone or text) → go to **Direct Agent Response Branch**.

---

## 3. No Response Branch

1. Wait 20 minutes.
2. Call listing agent or assistant.
3. If no answer or phone line engaged:
   - If brokerage already contacted for this listing during this workflow:
     - Wait another 20 minutes and re-evaluate.
   - If brokerage not yet contacted:
     - Call brokerage:
       - Confirm whether our listing agent record is correct.
       - If incorrect, capture correct listing agent details and assistant info.
       - Ask whether property/properties are still available.
       - Apply system updates using the rules in `docs/SYSTEM_UPDATES.md`.

Termination states:

- Listing agent/assistant info updated.
- Property availability confirmed or denied by brokerage.
- All showings for this batch cancelled if none of the properties are available.

---

## 4. Direct Agent Response Branch

When the listing agent responds (by call or text):

1. Confirm whether at least one property is still available.
   - If none are available:
     - Cancel associated showings.
     - Set category to “Canceled Showings”.
     - Set showing status to “Unavailable – Tenanted”.
     - Release rental specialist.
     - Trigger “Showings Route Plan – Final”.
   - If at least one property is available:
     - Ask if the agent prefers a quick call or to continue via text.
2. If phone is preferred:
   - Ask if we can call now or at another time.
   - If scheduled more than one hour away:
     - Request email.
     - Send calendar invite.
   - At confirmed time, run the **Deep Call Flow** (Section 5).
3. If text is preferred:
   - Keep channel as text but follow the same logical branches for offers, pets, remarks and system updates.

---

## 5. Deep Call Flow (Offers, Client Positioning, Pets)

Once in a scheduled live call with availability confirmed (or re-confirmed):

1. Offers:
   - If MLS shows registered offers:
     - Use “Offers #1” script: acknowledge offers are in hand.
   - If MLS does not show offers:
     - Use “Offers #2” script: explicitly ask whether any offers exist or are expected.
   - If offers exist:
     - Ask when the offer was received.
     - Ask about irrevocability times.
     - Ask whether the landlord is strongly considering the offer.
     - Ask whether there is still any point in the client visiting at the scheduled time.
     - If the agent recommends waiting for the outcome:
       - Set Tag C.
       - Cancel the showing for now.
       - Category: Pending Showings.
       - Status: “Temporarily Unavailable – Landlord Reviewing Offer”.
       - Release rental specialist and trigger “Showings Route Plan – Final”.

2. Client positioning (Tag A / Tag B):

- If Tag A exists (client package prepared: credit, employment letters, NOAs, references, etc.):
  - Present the client package.
  - Ask if anything else is required.
  - If the listing agent adds new criteria:
    - Set Tag B.
    - Persist new criteria under the property offer requirements.

3. Pets:

- Ask whether landlord would consider the client(s) with the described pet(s).
- If pets are not allowed:
  - Cancel showing.
  - Category: Canceled Showings.
  - Status: “Unavailable – No Pets Allowed”.
  - Update property records: “Pets NOT Allowed”.
  - Release rental specialist and trigger “Showings Route Plan – Final”.
- If the agent needs time to confirm:
  - Set Tag E.
  - Clarify whether the agent will follow up (Tag F) or we should follow up at a specific time (Tag G).
  - Optionally mark showing as:
    - Category: Pending Showings.
    - Status: “Temporarily Unavailable – Listing Agent needs more time to confirm if Pets are Allowed”.
  - Trigger route planning so the schedule is not blocked.
- If pets are allowed:
  - Update property records: “Pets Allowed”.
  - Depending on Tag J and remarks, either:
    - Confirm rental specialist and run the final route plan, or
    - Mark as “Under Review by Group” and push to the remark resolution workflow.

---

## 6. Brokerage / Client Remarks (Tag D / Tag J)

If the listing includes brokerage/client remarks that could block the showing:

1. Ask the agent for more detail on the remark.
2. Determine whether:
   - The problem is already resolved.
   - The problem can be resolved by contacting tenants.
   - The problem cannot be resolved.

Outcomes:

- If the problem cannot be resolved or is unacceptable:
  - Cancel showing.
  - Category: Canceled Showings.
  - Status: “Unavailable – [insert broker/client remark]”.
  - Release rental specialist and trigger “Showings Route Plan – Final”.
- If the problem is under review (Tag J):
  - Category: Pending Showings.
  - Status: “Under Review by Group”.
  - Trigger “Brokerage Remarks to be Addressed by Tenant”.
- If the problem is resolved:
  - Confirm rental specialist.
  - Keep or mark the showing as confirmed and run the standard route plan.

---

## 7. System Surfaces Touched

The workflow updates three main surfaces (see `docs/SYSTEM_UPDATES.md` for exact mappings):

- Property Showings Table:
  - Categories: Pending Showings, Canceled Showings, Confirmed Showings.
  - Status messages such as:
    - “Unavailable – Tenanted”
    - “Unavailable – No Pets”
    - “Temporarily Unavailable – Landlord Reviewing Offer”
    - “Temporarily Unavailable – Listing Agent needs more time to confirm if Pets are Allowed”
    - “Unavailable – [broker/client remark]”
    - “Under Review by Group”
- Property Records:
  - Pet policy flags.
  - Offer requirement fields that accumulate Tag B criteria.
- Resource Assignment:
  - Confirming or releasing the rental specialist.
  - Triggering “Showings Route Plan – Final” after cancellations or confirmations.

