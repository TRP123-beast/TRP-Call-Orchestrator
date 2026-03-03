# System Updates – Listing Agent Call #1

This document defines how conversational outcomes map to concrete system updates.  
Entities referenced:

- **Property Showings Table** (per showing)
- **Property Records** (per property)
- **Rental Specialist Assignment**
- **Workflows** (e.g., “Showings Route Plan – Final”, “Brokerage Remarks to be Addressed by Tenant”)

---

## 1. Showings – Categories and Status Strings

### 1.1 Categories

The workflow uses these canonical categories for the Property Showings Table:

- `Pending Showings`
- `Canceled Showings`
- `Confirmed Showings`

### 1.2 Status Values

These are the main status text values referenced by the Listing Agent Call #1 workflow:

- `Unavailable - Tenanted`
- `Unavailable - No Pets Allowed`
- `Unavailable - No Pets`
- `Unavailable - [insert broker/client remark]`
- `Temporarily Unavailable - Landlord Reviewing Offer`
- `Temporarily Unavailable - Listing Agent needs more time to confirm if Pets are Allowed`
- `Under Review by Group`

Status strings should be stored exactly as shown (unless a later normalization step is added).

---

## 2. Core Outcome → Update Mappings

### 2.1 All Properties Not Available (Agent or Brokerage)

**Trigger:** Listing agent or brokerage confirms that none of the properties in the batch are available.  
**Updates:**

- Property Showings Table:
  - `category = "Canceled Showings"`
  - `status = "Unavailable - Tenanted"`
- Rental Specialist:
  - Release any assigned rental specialist for these showings.
- Workflows:
  - Run `Showings Route Plan - Final` to rebuild the schedule without these showings.

---

### 2.2 Cancel Showing – No Pets

**Trigger:** Listing agent states that pets are not allowed and this blocks the client.  
**Updates:**

- Property Showings Table:
  - `category = "Canceled Showings"`
  - `status = "Unavailable - No Pets Allowed"` (or `Unavailable - No Pets` where appropriate).
- Property Records:
  - `petsAllowed = false` (or equivalent flag).
- Rental Specialist:
  - Release assigned rental specialist.
- Workflows:
  - Run `Showings Route Plan - Final`.

---

### 2.3 Cancel Showing – Broker/Client Remark Blocker

**Trigger:** Discussion of brokerage/client remarks leads to a decision that the problem cannot be resolved or is unacceptable for the client.  
**Updates:**

- Property Showings Table:
  - `category = "Canceled Showings"`
  - `status = "Unavailable - [insert broker/client remark]"` (string is composed using the actual remark).
- Rental Specialist:
  - Release assigned rental specialist.
- Workflows:
  - Run `Showings Route Plan - Final`.

---

### 2.4 Wait for Offer Outcome (Tag C)

**Trigger:** Listing agent confirms there is an offer in hand and recommends waiting for the outcome before proceeding with the showing.  
**Updates:**

- Property Showings Table:
  - `category = "Pending Showings"`
  - `status = "Temporarily Unavailable - Landlord Reviewing Offer"`
- Rental Specialist:
  - Release assigned rental specialist so schedule can be reused.
- Workflows:
  - Run `Showings Route Plan - Final`.
- Tags:
  - Set Tag C on the showing/property batch.

---

### 2.5 Under Review by Group (Tag J)

**Trigger:** Remarks discussion yields a “maybe” outcome; the group/client needs time to review details or complex conditions.  
**Updates:**

- Property Showings Table:
  - `category = "Pending Showings"`
  - `status = "Under Review by Group"`
- Workflows:
  - Run `Brokerage Remarks to be Addressed by Tenant`.
- Tags:
  - Set Tag J.

---

### 2.6 Temporarily Unavailable – Pets Confirmation Pending (Tag E / Tag H)

**Trigger:**

- Tag E set: agent needs time to confirm pets, and
- Either:
  - Proposed follow-up time would negatively affect route planning, or
  - Follow-up call (Tag H) still yields “no decision yet”.

**Updates:**

- Property Showings Table:
  - `category = "Pending Showings"`
  - `status = "Temporarily Unavailable - Listing Agent needs more time to confirm if Pets are Allowed"`
- Rental Specialist:
  - Release any assigned rental specialist for the affected slot(s).
- Workflows:
  - Run `Showings Route Plan - Final`.
- Tags:
  - Tag E remains active until resolved.
  - Tag H may be used to indicate “still unknown after follow-up”.

---

### 2.7 Pets Allowed – Proceed

**Trigger:** Listing agent explicitly confirms that the described pet(s) are acceptable.  
**Updates:**

- Property Records:
  - `petsAllowed = true`.
- Property Showings Table:
  - If Tag J does not exist:
    - Consider the showing confirmed or ready to be confirmed (depending on upstream rules).
  - If Tag J exists:
    - Keep as:
      - `category = "Pending Showings"`
      - `status = "Under Review by Group"`
- Rental Specialist:
  - If no blocking tags remain:
    - Confirm or keep assigned rental specialist.
- Workflows:
  - Run `Showings Route Plan - Final` when the showing is treated as confirmed or ready.

---

### 2.8 Confirmed Showing – Remarks Resolved

**Trigger:** A previously blocking remark has been resolved to everyone’s satisfaction.  
**Updates:**

- Property Showings Table:
  - Typically:
    - `category = "Confirmed Showings"` (or equivalent “active/confirmed” state).
    - Status may be cleared or set to a neutral/standard value, depending on global design.
- Rental Specialist:
  - Confirm or re-assign rental specialist for the showing.
- Workflows:
  - Include in next `Showings Route Plan - Final` run as a live stop.

---

### 2.9 Cancel Showing – Listing Agent Advises No Point in Visiting

**Trigger:** In the offers dialogue, agent states that landlord will almost certainly accept an existing offer and that there is effectively no point in visiting now.  
**Updates:**

- Either:
  - Treat as **Wait for Offer Outcome** (Section 2.4), or
  - Treat as full cancellation with appropriate status, depending on product decision.

If treated as full cancellation, reuse the patterns from Sections 2.1 or 2.3 as appropriate.

---

## 3. Offer Requirement Updates (Tag B)

**Trigger:** Listing agent adds extra offer criteria beyond the baseline package.  
**Updates:**

- Property Records:
  - Append or merge new criteria into the Property Offer Requirements field(s) for:
    - The specific property being discussed, or
    - All properties in the current listing agent batch, depending on configuration.
- Tags:
  - Set Tag B to indicate that additional criteria exist.

These requirements should be structured wherever possible (e.g., JSON fields) so later workflows can enforce or validate them.

---

## 4. Rental Specialist Assignment

High-level rules used in this workflow:

- **Release specialist when:**
  - Showings are canceled.
  - Showings are moved to a pending state due to offers or unresolved conditions where the time window would block schedule optimization.

- **Confirm specialist when:**
  - All blocking conditions (offers, pets, remarks) are resolved positively.
  - The property is ready for the client to visit.

All changes to specialist assignment should immediately trigger a route planning update when they affect a near-term schedule.

