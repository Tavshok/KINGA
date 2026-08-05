# KINGA Technologies  
## Confidentiality, Non-Disclosure, and Intellectual Property Assignment Agreement

**Document reference:** KINGA-LEGAL-NDA-001  
**Prepared by:** Tavonga Shoko (Lead Engineer)  
**Date of preparation:** August 2026  
**Version:** 1.0 — Final Draft

---

> **IMPORTANT NOTICE — READ BEFORE USE**
>
> This document is a final draft prepared for internal use by KINGA Technologies. It has been prepared by the engineering team to reflect KINGA's specific assets, operational context, and access tiers. **It has not yet been reviewed by a licensed attorney.** Before any individual signs either variant of this agreement, a qualified attorney licensed to practise in the relevant jurisdiction (Zimbabwe and/or Zambia, as applicable) must review and approve the final instrument. This document is not a substitute for legal advice. Every location marked `[ATTORNEY REVIEW: ...]` identifies a point where jurisdiction-specific law determines the answer and where legal sign-off is required before execution.

---

## How to Use This Document

This file contains three instruments:

1. **Part A — Employee Variant** (clauses 1–11): for direct employees of KINGA Technologies.
2. **Part B — Independent Contractor Variant** (clauses 1–11): for contractors, freelancers, agency-placed individuals, and individuals working through any mediated arrangement (including Manus-mediated engagements).
3. **Schedule 1 — Restricted-Tier Access Annex**: a short supplementary schedule to be signed separately when an individual is granted access to restricted-internals materials. This annex supplements either variant without requiring the base agreement to be re-signed.

The two variants share a common structure. Clauses that differ materially between variants are clearly marked. Clauses that are identical in both variants are drafted once in Part A and incorporated by reference in Part B.

---

---

# PART A — EMPLOYEE VARIANT

## Confidentiality, Non-Disclosure, and Intellectual Property Agreement  
## (Employee)

**THIS AGREEMENT** is entered into as of the date of signature below between:

**[KINGA ENTITY NAME]** (the "**Company**"), a company incorporated and registered under the laws of [JURISDICTION OF INCORPORATION] with registration number [REGISTRATION NUMBER], whose registered address is [REGISTERED ADDRESS];

[ATTORNEY REVIEW: Confirm the correct legal entity name, jurisdiction of incorporation, and registration number. KINGA may operate through different entities in Zimbabwe and Zambia. The contracting entity should be the one with which the employee has a direct employment relationship.]

and

**[FULL LEGAL NAME OF EMPLOYEE]** (the "**Employee**"), of [RESIDENTIAL ADDRESS], Identity/Passport Number [ID/PASSPORT NUMBER], engaged as [JOB TITLE / ROLE DESCRIPTION] commencing [START DATE].

The Company and the Employee are referred to individually as a "**Party**" and together as the "**Parties**."

---

### 1. Parties and Scope of Engagement

**1.1** The Employee is engaged directly by the Company as an employee under a contract of employment dated [DATE OF EMPLOYMENT CONTRACT] (the "**Employment Agreement**"). This Agreement is supplemental to and forms part of the terms and conditions of that employment.

**1.2** The Employee's role involves access to Confidential Information (as defined in clause 2) and, depending on the access tier assigned to the Employee, may involve access to Restricted-Internals Materials (as defined in Schedule 1). The obligations in this Agreement apply from the date of signature and continue in accordance with clause 7.

**1.3** The Employee acknowledges that the obligations in this Agreement follow the Employee personally and are not limited to work performed through any particular system, device, or channel. Where the Employee uses any third-party tool, platform, or service in the course of their work (including AI-assisted development tools), the obligations in this Agreement apply to all information accessed or processed through those tools.

---

### 2. Definition of Confidential Information

**2.1** "**Confidential Information**" means all information, in whatever form (written, oral, electronic, visual, or otherwise), that relates to the Company, its business, technology, operations, or clients, and that is disclosed to or accessed by the Employee in the course of their employment, including but not limited to:

**(a) Technical assets:**
- Source code, compiled binaries, configuration files, infrastructure-as-code, database schemas, and all technical documentation for the KINGA platform and any successor or related systems;
- System architecture, design documents, API specifications, data models, and the KINGA Engineering Manual and any restricted-internals documentation;
- All pipeline logic, stage implementations, orchestration code, and AI prompt templates used in the KINGA assessment pipeline;
- Computer vision models, training data, model weights, and evaluation datasets developed or used by the Company.

**(b) Fraud-scoring and forensic methodology:**
- Fraud-scoring logic, scoring weights, band thresholds, and all parameters used to classify claims by risk level;
- Physics calibration constants, vehicle stiffness coefficients, crush depth methodology, speed inference ensemble logic (including all method weights and consensus algorithm parameters), and the forensic reconstruction methodology used in the KINGA physics pipeline;
- Any information that, if disclosed, would allow a third party to reverse-engineer, circumvent, or predict the outputs of the fraud-scoring or physics engines.

**(c) Financial and commercial configuration:**
- Pricing structures, cost configuration, financial thresholds, and any business rules embedded in the cost optimisation engine;
- Commercial terms with insurers, panel beaters, assessors, or other partners;
- Revenue figures, margin data, client contract values, and financial projections.

**(d) Claim data and personal information:**
- All personal information relating to claimants, insured persons, third parties, insurers, panel beaters, or assessors that is processed through the KINGA platform, including names, contact details, vehicle information, incident descriptions, photographs, and assessment outcomes;
- This category of information is subject to data protection obligations in addition to the confidentiality obligations in this Agreement — see clause 5.

**(e) Business strategy and commercial intelligence:**
- Business strategy, product roadmap (including KINGA Labs and any future divisions or products), unreleased product plans, and go-to-market plans;
- Client lists, prospect lists, insurer and partner relationships, and the terms of any commercial arrangements;
- Information about the Company's competitive position, pricing strategy, or market analysis.

**(f) General catch-all:**
- Any information explicitly marked "Confidential," "Restricted," or "Not for Distribution";
- Any information that a reasonable person in the Employee's position would understand to be confidential given its nature or the circumstances of its disclosure, whether or not it is expressly marked as such. The Parties acknowledge that much Confidential Information is disclosed verbally, during onboarding sessions, or via screen-sharing, and the absence of a written label does not affect its confidential character.

**2.2** Confidential Information includes information belonging to third parties (including insurers, claimants, and panel beaters) that the Company holds under a duty of confidentiality.

---

### 3. Standard Exclusions

**3.1** The obligations in this Agreement do not apply to information that the Employee can demonstrate, by clear written evidence:

**(a)** was, at the time of disclosure, already in the public domain through no act or omission of the Employee;

**(b)** subsequently enters the public domain through no act or omission of the Employee;

**(c)** was already known to the Employee at the time of disclosure, as evidenced by records predating the disclosure;

**(d)** was independently developed by the Employee entirely without reference to the Confidential Information; or

**(e)** was received by the Employee from a third party who was lawfully entitled to disclose it and who imposed no duty of confidentiality.

**3.2** If the Employee is required by law, court order, or regulatory authority to disclose any Confidential Information, the Employee must: (i) notify the Company promptly and in writing before making any disclosure, to the extent permitted by law; (ii) cooperate with the Company in seeking a protective order or other appropriate relief; and (iii) disclose only the minimum information required to comply with the legal obligation.

**3.3** The exclusions in clause 3.1 are to be construed narrowly. The burden of proof rests on the Employee to establish that an exclusion applies. The exclusions do not apply to claim data or personal information, which remains subject to data protection obligations regardless of its public availability.

---

### 4. Tiered Obligations for Restricted-Internals Access

**4.1** All Employees with access to the KINGA codebase or claim data are subject to the **Standard Tier** obligations in this Agreement.

**4.2** Employees who are additionally granted access to Restricted-Internals Materials — being the fraud-scoring weights, physics calibration constants, financial configuration, and the restricted-internals documentation identified in Schedule 1 — are subject to the **Restricted Tier** obligations set out in Schedule 1 to this Agreement.

**4.3** Restricted Tier access is granted by the Company on a named-individual basis. The Employee will be notified in writing when Restricted Tier access is granted and will be required to sign Schedule 1 at that time. Schedule 1 may be signed at any point during the engagement without requiring this base Agreement to be re-executed.

**4.4** The Employee must not access Restricted-Internals Materials unless and until they have signed Schedule 1.

---

### 5. Data Protection Compliance

**5.1** The Employee acknowledges that personal information processed through the KINGA platform is subject to applicable data protection legislation in the jurisdictions where the Company operates.

[ATTORNEY REVIEW: Insert precise statutory citations. The relevant instruments are expected to include Zimbabwe's Cyber and Data Protection Act (Chapter 12:07, as amended) and Zambia's Data Protection Act No. 3 of 2021. The attorney should confirm the current in-force versions, any implementing regulations, and whether any sector-specific insurance or financial services data protection requirements apply.]

**5.2** The Employee must:

**(a)** access personal information only to the extent strictly necessary for the performance of their assigned duties;

**(b)** not export, copy, or transmit personal information to personal devices, personal cloud storage accounts, personal email accounts, or any tool or service not approved by the Company for the processing of personal information;

**(c)** not input personal information relating to claimants, insurers, or panel beaters into any general-purpose AI tool, large language model, or external processing service outside the Company's sanctioned toolchain;

**(d)** report any actual or suspected unauthorised access to, or disclosure of, personal information to the Company's designated data protection contact immediately upon becoming aware of it;

**(e)** comply with any data handling procedures, data classification policies, or data protection training requirements issued by the Company from time to time.

**5.3** The Employee acknowledges that obligations under data protection legislation are independent of and in addition to the confidentiality obligations in this Agreement, and that a breach of data protection obligations may constitute a breach of both this Agreement and applicable law.

---

### 6. Intellectual Property — Employee Variant

**6.1** The Employee acknowledges that all Intellectual Property Rights in work product created by the Employee in the course of their employment with the Company vest in the Company by operation of law and/or by virtue of this Agreement.

[ATTORNEY REVIEW: Confirm the applicable statutory default for employer ownership of employee-created IP in Zimbabwe and Zambia. In Zimbabwe, the relevant instrument is the Patents Act (Chapter 26:03) and the Copyright and Neighbouring Rights Act (Chapter 26:05). In Zambia, the relevant instruments are the Patents and Companies Registration Agency Act and the Copyright and Performance Rights Act. The attorney should confirm whether the statutory default is sufficient or whether an express assignment clause is required in each jurisdiction.]

**6.2** To the extent that any Intellectual Property Rights in work product created by the Employee in the course of their employment do not automatically vest in the Company by operation of law, the Employee hereby assigns to the Company, with full title guarantee, all such Intellectual Property Rights, including the right to apply for registrations, renewals, and extensions of those rights in any jurisdiction.

**6.3** "**Intellectual Property Rights**" means all patents, copyright, database rights, trade secrets, know-how, trade marks, design rights, and all other intellectual property rights, whether registered or unregistered, subsisting anywhere in the world, including all applications for and renewals or extensions of such rights.

**6.4** "**Work product**" means all code, documentation, designs, analyses, reports, models, algorithms, data structures, and other materials created by the Employee in the course of their employment, whether or not created during working hours, using Company equipment, or on Company premises, provided that the creation relates to the Company's actual or reasonably anticipated business.

**6.5** The Employee must promptly disclose to the Company any work product created in the course of their employment and must execute all documents and do all acts reasonably required by the Company to give effect to the assignment in clause 6.2.

**6.6** This clause does not apply to tools, libraries, or materials created by the Employee entirely outside the scope of their employment and before the commencement of their employment, provided that the Employee discloses any such pre-existing materials to the Company before using them in the course of their work. The Company will not unreasonably withhold consent to the Employee's use of disclosed pre-existing materials.

---

### 7. Term and Survival

**7.1** This Agreement takes effect on the date of signature and continues for the duration of the Employee's employment with the Company and thereafter as follows:

**(a)** Obligations relating to trade secrets — being the fraud-scoring weights, physics calibration constants, financial configuration, and any other information that qualifies as a trade secret under applicable law — survive termination of employment **indefinitely**.

**(b)** Obligations relating to all other Confidential Information survive termination of employment for a period of **[TERM — ATTORNEY TO ADVISE]** years from the date of termination.

[ATTORNEY REVIEW: Advise on the maximum enforceable post-employment confidentiality term for non-trade-secret information in Zimbabwe and Zambia. Courts in both jurisdictions apply a reasonableness test. A term of 2–5 years is commonly used but must be calibrated to the specific role and the nature of the information.]

**(c)** The IP assignment in clause 6 is permanent and does not lapse on termination.

**7.2** Termination of employment for any reason does not affect any accrued rights or obligations under this Agreement.

---

### 8. Return and Destruction of Materials

**8.1** On the termination of employment (for any reason) or on written demand by the Company at any time, the Employee must:

**(a)** immediately return to the Company all Confidential Information and all materials containing Confidential Information in the Employee's possession or control, in whatever form;

**(b)** permanently delete all Confidential Information from personal devices, personal cloud storage accounts, and any other location outside the Company's systems, and confirm such deletion in writing to the Company within [NUMBER] business days of termination;

**(c)** to the extent feasible, delete or request deletion of any Confidential Information from the history, logs, or memory of any AI tool or external service used in the course of employment;

**(d)** cooperate with the Company's IT team to confirm that all system access credentials have been revoked and that no copies of Confidential Information remain outside the Company's controlled systems.

**8.2** The Employee's obligation to return or destroy materials does not apply to copies that the Employee is required to retain by law, provided that the Employee notifies the Company of the nature and location of any such retained copies.

---

### 9. Remedies

**9.1** The Employee acknowledges that:

**(a)** a breach of this Agreement, particularly a breach involving Restricted-Internals Materials, may cause the Company irreparable harm that cannot be adequately compensated by an award of damages alone;

**(b)** in the event of an actual or threatened breach, the Company may seek injunctive relief or other equitable remedies in addition to any claim for damages, without being required to prove actual loss.

[ATTORNEY REVIEW: Confirm the availability and standard for injunctive relief in Zimbabwe and Zambia in the context of employment and confidentiality disputes. Advise on whether an express acknowledgment of irreparable harm is enforceable or whether courts will independently assess this.]

**9.2** The remedies in this Agreement are cumulative and not exclusive of any other rights or remedies available to the Company under applicable law.

---

### 10. Non-Solicitation (Optional — Flagged for Separate Decision)

> **Note:** This clause is included as a separable optional provision. The Company must decide, with legal advice, whether to include it, and if so, in what form. Broader non-compete restrictions are not included here — see the attorney review note below.

**10.1** [OPTIONAL] During the Employee's employment and for a period of **[TERM — ATTORNEY TO ADVISE]** months following termination, the Employee must not, directly or indirectly, solicit or attempt to solicit:

**(a)** any client or insurer partner of the Company with whom the Employee had material dealings in the [NUMBER] months prior to termination, for the purpose of providing services that compete with the services provided by the Company; or

**(b)** any employee or contractor of the Company with whom the Employee worked, for the purpose of inducing them to leave the Company.

[ATTORNEY REVIEW: Non-solicitation clauses are generally more enforceable than non-compete clauses in both Zimbabwe and Zambia, but they must be reasonable in scope, duration, and geographic reach. Advise on the maximum enforceable term and whether the clause as drafted is proportionate to the Employee's seniority and access. Broader non-compete restrictions (prohibiting the Employee from working in the same industry) are frequently unenforceable as restraints of trade in this region and are deliberately excluded from this draft — advise if the Company wishes to include them and what the enforceability risk is.]

---

### 11. Governing Law and Dispute Resolution

**11.1** [ATTORNEY REVIEW: Insert the governing law and jurisdiction. Key considerations: (a) the jurisdiction in which the Company is incorporated; (b) the jurisdiction in which the Employee is resident and performs their work; (c) whether a single governing law is appropriate given KINGA's cross-border footprint; (d) whether arbitration is preferable to litigation for confidentiality reasons. Do not default to a jurisdiction without instruction — the choice of law has material consequences for the enforceability of the restraint provisions.]

**11.2** [PLACEHOLDER] This Agreement is governed by the laws of [JURISDICTION]. Any dispute arising out of or in connection with this Agreement shall be [resolved by the courts of [JURISDICTION] / submitted to arbitration in accordance with [ARBITRATION RULES] in [SEAT OF ARBITRATION]].

---

### Signature Block — Employee Variant

**Signed for and on behalf of [KINGA ENTITY NAME]:**

| | |
|---|---|
| Signature | _________________________ |
| Full name | _________________________ |
| Title | _________________________ |
| Date | _________________________ |

**Signed by the Employee:**

| | |
|---|---|
| Signature | _________________________ |
| Full legal name | _________________________ |
| Identity / Passport No. | _________________________ |
| Date | _________________________ |
| Witness signature | _________________________ |
| Witness full name | _________________________ |
| Witness address | _________________________ |

---

---

# PART B — INDEPENDENT CONTRACTOR VARIANT

## Confidentiality, Non-Disclosure, and Intellectual Property Assignment Agreement  
## (Independent Contractor)

**THIS AGREEMENT** is entered into as of the date of signature below between:

**[KINGA ENTITY NAME]** (the "**Company**"), a company incorporated and registered under the laws of [JURISDICTION OF INCORPORATION] with registration number [REGISTRATION NUMBER], whose registered address is [REGISTERED ADDRESS];

[ATTORNEY REVIEW: Same entity-identification requirement as Part A. Confirm the correct legal entity and its relationship to any Zambian operating entity if the contractor is engaged in Zambia.]

and

**[FULL LEGAL NAME OF CONTRACTOR]** (the "**Contractor**"), of [RESIDENTIAL ADDRESS], Identity/Passport Number [ID/PASSPORT NUMBER], engaged as [ROLE / SERVICE DESCRIPTION].

The Contractor is engaged:

☐ Directly as an independent contractor  
☐ Through an agency or intermediary: [NAME OF AGENCY / INTERMEDIARY]  
☐ Through a Manus-mediated or platform-mediated arrangement  
☐ Through an umbrella company or personal service company: [ENTITY NAME]  
☐ Other arrangement: [DESCRIBE]

The Parties acknowledge that regardless of the route through which the engagement is structured, the obligations in this Agreement attach to the Contractor personally and follow the Contractor in all circumstances.

---

### 1. Parties and Scope of Engagement

**1.1** The Contractor is engaged by the Company as an independent contractor to provide services described in the applicable Statement of Work or engagement letter (the "**Services**"). The Contractor is not an employee of the Company, and nothing in this Agreement creates an employment relationship.

**1.2** The Contractor's engagement involves access to Confidential Information (as defined in clause 2) and, depending on the access tier assigned, may involve access to Restricted-Internals Materials (as defined in Schedule 1).

**1.3** The obligations in this Agreement apply from the date of signature and continue in accordance with clause 7. They apply to all work performed by the Contractor in connection with the Services, regardless of the device, system, or channel used, and regardless of whether the work is performed on Company premises, remotely, or through any intermediary platform.

**1.4** Where the Contractor uses any AI-assisted development tool, code generation service, or external processing platform in the course of providing the Services, the obligations in this Agreement apply to all Confidential Information accessed or processed through those tools. The Contractor must not use any tool or service not approved by the Company for the processing of Confidential Information or personal data.

---

### 2. Definition of Confidential Information

**2.1** The definition of Confidential Information in clause 2 of Part A (the Employee Variant) is incorporated here in full and applies equally to the Contractor. For the avoidance of doubt, all sub-clauses 2.1(a) through 2.1(f) and clause 2.2 of Part A apply to this Agreement.

---

### 3. Standard Exclusions

**3.1** The exclusions in clause 3 of Part A are incorporated here in full and apply equally to the Contractor.

---

### 4. Tiered Obligations for Restricted-Internals Access

**4.1** The tiered access structure in clause 4 of Part A is incorporated here in full and applies equally to the Contractor. All Contractors with access to the KINGA codebase or claim data are subject to the Standard Tier. Contractors granted access to Restricted-Internals Materials must sign Schedule 1 before accessing those materials.

---

### 5. Data Protection Compliance

**5.1** The data protection obligations in clause 5 of Part A are incorporated here in full and apply equally to the Contractor.

**5.2** The Contractor acknowledges that, as an independent contractor, they may be a data processor in their own right under applicable data protection legislation, and that they must comply with all obligations applicable to data processors, including obligations relating to security, sub-processing, and breach notification.

[ATTORNEY REVIEW: Confirm whether the Contractor's status as an independent processor requires a separate data processing agreement (DPA) under Zimbabwe's Cyber and Data Protection Act and Zambia's Data Protection Act. If so, a DPA should be executed alongside this Agreement.]

---

### 6. Intellectual Property — Contractor Variant

> **Important note on contractor IP:** Under the default rules of both Zimbabwean and Zambian law, intellectual property created by an independent contractor does not automatically vest in the commissioning party. This is the critical gap that this clause is designed to close. The express assignment and fallback licence provisions below are essential — do not rely on any implied assignment or the employment IP default.

[ATTORNEY REVIEW: Confirm the default IP ownership rules for contractor-created works under Zimbabwe's Copyright and Neighbouring Rights Act (Chapter 26:05) and Zambia's Copyright and Performance Rights Act. Confirm whether the "work for hire" doctrine (as understood in US law) has any equivalent in either jurisdiction, and whether the express assignment in clause 6.1 is sufficient to transfer ownership of all categories of work product (including software, databases, and written works) without any additional formality.]

**6.1 Present assignment.** The Contractor hereby assigns to the Company, with full title guarantee and as a present assignment taking effect immediately on creation, all Intellectual Property Rights in all work product created by the Contractor in the course of providing the Services (the "**Assigned IP**"). This assignment includes:

**(a)** all copyright, database rights, and related rights in all code, documentation, reports, analyses, models, and other materials created in the course of the Services;

**(b)** all rights to apply for patents, design registrations, or other registrable rights in respect of inventions or designs conceived in the course of the Services;

**(c)** the right to sue for past infringement of any of the above rights;

**(d)** all rights in any jurisdiction equivalent to the rights described above.

**6.2 Fallback licence.** To the extent that any Intellectual Property Rights in the Assigned IP cannot be assigned as a matter of law (for example, certain moral rights or rights that are inalienable under applicable law), the Contractor hereby grants to the Company an irrevocable, perpetual, worldwide, royalty-free, fully paid-up, exclusive licence (with the right to sub-licence) to use, reproduce, modify, distribute, and exploit those rights in any manner and for any purpose.

**6.3 Moral rights waiver.** To the maximum extent permitted by applicable law, the Contractor waives all moral rights (including rights of paternity and integrity) in the Assigned IP in favour of the Company and any person authorised by the Company.

[ATTORNEY REVIEW: Confirm the extent to which moral rights can be waived under Zimbabwe's Copyright and Neighbouring Rights Act and Zambia's Copyright and Performance Rights Act. In some jurisdictions, moral rights are inalienable and cannot be waived by contract — if so, the fallback licence in clause 6.2 must be drafted to cover the practical consequences of that inalienability.]

**6.4 Pre-existing materials.** The assignment in clause 6.1 does not apply to tools, libraries, frameworks, or other materials that:

**(a)** were created by the Contractor entirely before the commencement of the engagement; and

**(b)** are disclosed by the Contractor to the Company in writing before being incorporated into any work product.

The Contractor must disclose all pre-existing materials before use. Where pre-existing materials are incorporated into work product, the Contractor grants the Company a perpetual, irrevocable, royalty-free licence to use those materials as part of the work product.

**6.5 Further assurance.** The Contractor must promptly execute all documents and do all acts reasonably required by the Company to perfect, register, or enforce the assignment of Intellectual Property Rights in any jurisdiction.

**6.6** "**Intellectual Property Rights**" and "**work product**" have the meanings given in clauses 6.3 and 6.4 of Part A respectively, and apply equally to this Agreement.

---

### 7. Term and Survival

**7.1** This Agreement takes effect on the date of signature and continues for the duration of the engagement and thereafter as follows:

**(a)** Obligations relating to trade secrets — being the fraud-scoring weights, physics calibration constants, financial configuration, and any other information that qualifies as a trade secret under applicable law — survive termination of the engagement **indefinitely**.

**(b)** Obligations relating to all other Confidential Information survive termination of the engagement for a period of **[TERM — ATTORNEY TO ADVISE]** years from the date of termination.

[ATTORNEY REVIEW: Advise on the maximum enforceable post-engagement confidentiality term for non-trade-secret information for independent contractors in Zimbabwe and Zambia. The enforceability analysis for contractors may differ from that for employees — advise accordingly.]

**(c)** The IP assignment in clause 6 is permanent and does not lapse on termination.

**7.2** Termination of the engagement for any reason does not affect any accrued rights or obligations under this Agreement.

---

### 8. Return and Destruction of Materials

**8.1** The return and destruction obligations in clause 8 of Part A are incorporated here in full and apply equally to the Contractor, with references to "employment" and "Employee" read as references to "engagement" and "Contractor" respectively.

---

### 9. Remedies

**9.1** The remedies provisions in clause 9 of Part A are incorporated here in full and apply equally to the Contractor.

[ATTORNEY REVIEW: Same review point as Part A — confirm availability of injunctive relief for contractor confidentiality breaches in Zimbabwe and Zambia.]

---

### 10. Non-Solicitation (Optional — Flagged for Separate Decision)

> **Note:** This clause is included as a separable optional provision. Non-compete restrictions are deliberately excluded — they are frequently unenforceable for independent contractors in this region. See the attorney review note.

**10.1** [OPTIONAL] During the engagement and for a period of **[TERM — ATTORNEY TO ADVISE]** months following termination, the Contractor must not, directly or indirectly, solicit or attempt to solicit:

**(a)** any client or insurer partner of the Company with whom the Contractor had material dealings in the course of the engagement, for the purpose of providing services that compete with the Services; or

**(b)** any employee or contractor of the Company with whom the Contractor worked, for the purpose of inducing them to leave the Company.

[ATTORNEY REVIEW: Non-compete clauses for independent contractors are generally unenforceable or heavily restricted as restraints of trade in Zimbabwe and Zambia. Non-solicitation clauses are more defensible but must still be reasonable in scope and duration. Advise on the maximum enforceable term and geographic scope, and whether the clause as drafted is proportionate to the Contractor's role and access level. If the Company wishes to include a non-compete, advise on the enforceability risk and what limitations would be required to give it any prospect of being upheld.]

---

### 11. Governing Law and Dispute Resolution

**11.1** [ATTORNEY REVIEW: Same review point as Part A. For contractors, additional considerations include: (a) the jurisdiction in which the Contractor is resident and performs their work; (b) whether the engagement is cross-border; (c) whether the governing law of the engagement agreement (Statement of Work) should match the governing law of this Agreement.]

**11.2** [PLACEHOLDER] This Agreement is governed by the laws of [JURISDICTION]. Any dispute arising out of or in connection with this Agreement shall be [resolved by the courts of [JURISDICTION] / submitted to arbitration in accordance with [ARBITRATION RULES] in [SEAT OF ARBITRATION]].

---

### Signature Block — Contractor Variant

**Signed for and on behalf of [KINGA ENTITY NAME]:**

| | |
|---|---|
| Signature | _________________________ |
| Full name | _________________________ |
| Title | _________________________ |
| Date | _________________________ |

**Signed by the Contractor:**

| | |
|---|---|
| Signature | _________________________ |
| Full legal name | _________________________ |
| Identity / Passport No. | _________________________ |
| Trading name (if applicable) | _________________________ |
| Intermediary / agency name (if applicable) | _________________________ |
| Date | _________________________ |
| Witness signature | _________________________ |
| Witness full name | _________________________ |
| Witness address | _________________________ |

---

---

# SCHEDULE 1 — RESTRICTED-TIER ACCESS ANNEX

## KINGA Technologies  
## Restricted-Tier Access Annex

**Document reference:** KINGA-LEGAL-NDA-001-ANNEX-[NUMBER]  
**Base agreement reference:** KINGA-LEGAL-NDA-001 (Employee / Contractor Variant — delete as applicable)

**THIS ANNEX** supplements the Confidentiality, Non-Disclosure, and Intellectual Property Assignment Agreement (the "**Base Agreement**") entered into between [KINGA ENTITY NAME] (the "**Company**") and [FULL LEGAL NAME] (the "**Individual**") dated [DATE OF BASE AGREEMENT].

This Annex is signed when the Individual is granted access to Restricted-Internals Materials. It does not require the Base Agreement to be re-executed.

---

### S1.1 Definition of Restricted-Internals Materials

"**Restricted-Internals Materials**" means the following categories of information, which represent the most competitively sensitive assets of the Company:

**(a)** Fraud-scoring weights, band thresholds, and all numerical parameters used to classify claims by risk level, including any documentation that discloses or allows inference of those values;

**(b)** Physics calibration constants, including vehicle stiffness coefficients, crush depth thresholds, speed inference method weights, consensus algorithm parameters, and any documentation that discloses or allows inference of those values;

**(c)** Financial configuration, including pricing tiers, cost thresholds, margin parameters, and any business rules embedded in the cost optimisation engine that disclose the Company's financial structure;

**(d)** The KINGA Restricted-Internals Documentation (as identified by the Company from time to time), including any document marked "Restricted — Internal Use Only" or equivalent;

**(e)** Any system, database, or configuration file that stores or exposes the values described in (a)–(d) above.

---

### S1.2 Heightened Obligations

In addition to the Standard Tier obligations in the Base Agreement, the Individual must:

**(a)** not reproduce, transcribe, copy, or record any specific numerical value from Restricted-Internals Materials outside Company-controlled systems — this prohibition applies to personal notes (handwritten or digital), personal devices, personal cloud storage, and any communication channel not operated by the Company;

**(b)** not discuss, share, or disclose specific fraud-scoring weights, physics calibration constants, or financial configuration values in any external channel, including personal messaging applications, email accounts not operated by the Company, code repositories not operated by the Company, or any third-party AI tool or processing service;

**(c)** not use Restricted-Internals Materials for any purpose other than the performance of their assigned duties for the Company;

**(d)** immediately report to the Company's designated security contact any actual or suspected unauthorised access to, or disclosure of, Restricted-Internals Materials;

**(e)** comply with any additional access control, logging, or handling procedures specified by the Company for Restricted-Internals Materials.

---

### S1.3 Acknowledgment

The Individual acknowledges that:

**(a)** Restricted-Internals Materials are the category of information that most directly determines the Company's competitive position and the integrity of its forensic assessment outputs;

**(b)** unauthorised disclosure of Restricted-Internals Materials would cause harm to the Company that is not adequately compensable by damages alone;

**(c)** the heightened obligations in this Annex are reasonable and proportionate given the nature of the information and the Individual's access level.

---

### S1.4 Survival

The heightened obligations in this Annex survive termination of the engagement indefinitely, consistent with the trade-secret survival provision in clause 7.1(a) of the Base Agreement.

---

### Signature Block — Restricted-Tier Annex

**Date of grant of Restricted-Tier access:** _________________________

**Signed for and on behalf of [KINGA ENTITY NAME]:**

| | |
|---|---|
| Signature | _________________________ |
| Full name | _________________________ |
| Title | _________________________ |
| Date | _________________________ |

**Signed by the Individual:**

| | |
|---|---|
| Signature | _________________________ |
| Full legal name | _________________________ |
| Date | _________________________ |

---

---

# COVER NOTE — ATTORNEY REVIEW CHECKLIST

The following items require legal sign-off before this Agreement is executed. Each item corresponds to a `[ATTORNEY REVIEW]` placeholder in the body of the document.

| # | Item | Location | What is needed |
|---|---|---|---|
| 1 | **KINGA entity name and registration** | Part A §1, Part B §1 | Confirm the correct legal entity name, jurisdiction of incorporation, and registration number for each variant. If different entities are used for Zimbabwe and Zambia engagements, produce separate execution versions. |
| 2 | **Employee IP default — Zimbabwe** | Part A §6.1 | Confirm whether the Copyright and Neighbouring Rights Act (Chapter 26:05) and Patents Act (Chapter 26:03) vest employee-created IP in the employer by default, and whether the express assignment in clause 6.2 is required or belt-and-braces. |
| 3 | **Employee IP default — Zambia** | Part A §6.1 | Same question under Zambia's Copyright and Performance Rights Act and the Patents and Companies Registration Agency Act. |
| 4 | **Contractor IP default — Zimbabwe and Zambia** | Part B §6 (opening note) | Confirm that contractor-created IP does not vest in the commissioning party by default under either jurisdiction's law, and that the express present assignment in clause 6.1 is the correct mechanism to close this gap. |
| 5 | **Moral rights waiver — Zimbabwe and Zambia** | Part B §6.3 | Confirm the extent to which moral rights can be waived by contract in each jurisdiction. If inalienable, confirm that the fallback licence in clause 6.2 adequately addresses the practical consequences. |
| 6 | **Data protection statutory citations** | Part A §5.1, Part B §5.2 | Insert precise citations to Zimbabwe's Cyber and Data Protection Act (Chapter 12:07) and Zambia's Data Protection Act No. 3 of 2021, including any implementing regulations. Confirm whether a separate data processing agreement is required for contractors. |
| 7 | **Post-employment confidentiality term** | Part A §7.1(b) | Advise on the maximum enforceable post-employment confidentiality term for non-trade-secret information in Zimbabwe and Zambia. |
| 8 | **Post-engagement confidentiality term (contractors)** | Part B §7.1(b) | Same question for independent contractors — advise whether the analysis differs from the employee position. |
| 9 | **Injunctive relief — Zimbabwe** | Part A §9.1, Part B §9.1 | Confirm the availability and standard for injunctive relief in confidentiality disputes under Zimbabwean law. |
| 10 | **Injunctive relief — Zambia** | Part A §9.1, Part B §9.1 | Same question under Zambian law. |
| 11 | **Non-solicitation enforceability — employees** | Part A §10.1 | Advise on the maximum enforceable term and geographic scope for non-solicitation of clients and staff post-employment in Zimbabwe and Zambia. |
| 12 | **Non-solicitation enforceability — contractors** | Part B §10.1 | Same question for independent contractors. Advise on whether a non-compete clause could be included and what the enforceability risk would be. |
| 13 | **Governing law and jurisdiction** | Part A §11, Part B §11 | Advise on the appropriate governing law and dispute resolution mechanism given KINGA's cross-border footprint. Consider whether arbitration is preferable to litigation for confidentiality reasons. |
| 14 | **Contractor as data processor** | Part B §5.2 | Confirm whether a separate data processing agreement is required under Zimbabwe and Zambia data protection law for contractors who process personal data in the course of their engagement. |

---

*End of document.*
