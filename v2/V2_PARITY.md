# V2 PARITY CONTRACT — PestOps

Authoritative merge of six v1 extraction reports. Anything not listed here silently does not exist in v2.
All `file:line` references are into the v1 codebase (`assets/js/…`). Where reports conflicted, the engine
report (store.js/data.js) wins.

---

## 1. DATA MODEL

### 1.1 db (root)
| Field | Type | Notes |
|---|---|---|
| v | number (16) | DB_VER; DB_KEY `pestops.db.v16` — store.js:7-9 |
| demo | bool | demo vs fresh seed — data.js:1129-1162 |
| company, branches[], users[], services[], inventory[], leadSources[], propertyTypes[], waTemplates[] | setup collections | ALWAYS seeded, even when demo:false |
| clients[], leads[], quotations[], contracts[], jobs[], stockMoves[], audits[], invoices[], payments[], notifications[] | work collections | empty when demo:false — data.js:1132-1162 |
| seq | object | per-kind id counters (see 1.24) |

Persisted whole to localStorage key `pestops.db.v16` (store.js:8,50-53). v2: PostgreSQL.

### 1.2 session
| Field | Type | Notes |
|---|---|---|
| userId | string | signed-in user id |
| at | epoch ms | localStorage key `pestops.session.v16` — store.js:9,75-78; read by `me()` store.js:80-84 |

### 1.3 company
| Field | Type | Notes |
|---|---|---|
| name, tagline, addr1, addr2, phone, email, web | string | letterhead — data.js:72-96. Seed: 'Shield Pest Control Services', '+91 98400 12345', 'ops@shieldpest.in' |
| gstin | string | seed '33AABCS1429B1ZP' |
| state | string | GST home state, default 'Tamil Nadu' — homeState store.js:420-422 |
| licence | string | seed 'TN/PCO/2014/1187' |
| bank | {name, ac, ifsc} | payment block on docs |
| upi | string | seed 'shieldpest@hdfcbank' |
| gstRate | number (18) | drives all tax math — taxSplit store.js:478; editable in Settings (settings.js:306, fallback 18) |
| currency | '₹' | |
| terms | string[] (5 seeded) | data.js:89-96; copied to new quotations/contracts; edited index-wise settings.js:312-316 |
| hours | {from, to, days[]} optional | company default working hours — workHours store.js:531 |

### 1.4 branch
| Field | Type | Notes |
|---|---|---|
| id | 'BR-NN' | first free number scan — masterdata.js:21-26 |
| name, code | string, REQUIRED | code uppercased ≤6, UNIQUE case-insensitive — masterdata.js:70 |
| city, addr, pin, phone, email | string | city default 'Chennai' |
| managerId | userId (admin/ops/sales) or '' | |
| gstin | string uppercased | |
| opened | ISO | default today |
| active | bool | Operating/Closed; closed branches never match territory routing |
| areas | string[] | comma-split, case-insensitive deduped localities; drive branchForArea — store.js:169-190, data.js:101-120 |

### 1.5 user
| Field | Type | Notes |
|---|---|---|
| id | 'Unn' | 'U'+pad2(users.length+1) — team.js:299 (length-based, collides after delete) |
| name, phone | string, REQUIRED | team.js:269-278 |
| role | 'admin'\|'ops'\|'sales'\|'tech'\|'accounts'\|'client' | |
| title | string | designation; auto-follows role default while unedited (DEFAULT_TITLE team.js:10, 224-226) |
| email, addr, dob | string | |
| color | hex | 7-colour palette by index |
| joined | ISO | default today |
| photo | dataURL or '' | shrunk to 320px — team.js:144 |
| sign | dataURL | signature, shrunk to 520px — team.js:159; auto-placed on quotes/contracts the user raises |
| branches | branchId[] ≥1 REQUIRED | team.js:278-281 |
| empType | EMP_TYPES | ['Full-time','Part-time','Contract','Probation','Intern'] data.js:160 |
| blood | BLOOD_GROUPS | data.js:159 |
| aadhaar | string | if present must be 12 digits — team.js:284 |
| docs | [{name, src:dataURL(900px)}] | scans — team.js:321 |
| emergency | [{name, relation(RELATIONS data.js:158), phone}] ≥1 valid REQUIRED | team.js:289-295 |
| hours | {from:'HH:MM', to:'HH:MM', days:int[0-6]} OPTIONAL | overrides company.hours — store.js:529-538; **no editor UI in v1** |
| *(tech only)* skills | string[] | comma-split; substring-matched both directions to service names — store.js:599-608, 739-745 |
| *(tech only)* licence | string | applicator licence |
| *(tech only)* rating, jobsDone | number, int | seed stats; new users get rating:0, jobsDone:0 |
| *(client role)* clientId | 'CL-nnn' | links portal user to customer — data.js:213 |

Seed.ROLES[role] = {label, desc, icon, color} — data.js:216-223: admin 'Administrator'/shieldcheck/#0B7454; ops 'Operations Manager'/route/#7C3AED; sales 'Sales Executive'/trendup/#2E90FA; tech 'Field Technician'/hardhat/#F79009; accounts 'Accounts & Billing'/receipt/#DB2777; client 'Customer Portal'/building/#0891B2.

### 1.6 service
| Field | Type | Notes |
|---|---|---|
| id | 'SVnn' | 'SV'+pad2(services.length+1) — services.js:222 (length-based) |
| name | string REQUIRED | |
| code | string | default name.slice(0,3).toUpperCase() |
| cat | 'Residential'\|'Commercial'\|'Specialised'\|'Industrial' | |
| price | number | standard rate ₹ |
| unit | string | charged-per text; `/per visit/i` is SEMANTIC (drives visits auto-sync in quote builder) |
| mins | int default 60 | default visit duration — planLine data.js:504 |
| warranty, desc | string | |
| chem | inventoryId[] | chemicals used — services.js:74 |
| defaultFreq | FREQS label | from SERVICE_META else 'Monthly' — data.js:336-341 |
| checklist | string[] | technician tick-list; multi-service visit gets the union — SERVICE_META data.js:251-334 |
| pdf | {name,size,data:dataURL} \| null | info sheet PDF ≤1500KB (MAX_PDF_KB services.js:14); auto-attached to quotations |

### 1.7 client
| Field | Type | Notes |
|---|---|---|
| id | 'CL-nnn' | 'CL-'+pad3(clients.length+1) — clients.js:454 & store.js:1314 (length-based, collides after delete) |
| name | string REQUIRED | auto-suggest = company \|\| 'first last' — clients.js:361-366 |
| custType | 'Business'\|'Individual' | CUSTOMER_TYPES data.js:124 |
| type | property type | ['Residential','Society','Commercial','Retail','Industrial','Healthcare','Education','Corporate','Hospitality'] clients.js:12 |
| company, salutation, first, last | string | SALUTATIONS ['','Mr.','Mrs.','Ms.','Miss','Dr.'] data.js:123 |
| contact | string | 'sal first last' joined, fallback name — clients.js:440,466 |
| phone | string REQUIRED | fallback workPhone; matched via phoneKey (last 10 digits) |
| workPhone, email, language | string | LANGUAGES data.js:125 |
| channels | {email, sms, whatsapp: bool} | defaults email+whatsapp checked |
| gstTreatment | REQUIRED, one of 9 GST_TREATMENTS | data.js:129-139 |
| placeOfSupply | STATES (36 entries data.js:147-155) | drives CGST/SGST vs IGST |
| gstin | string uppercase ≤15 | |
| pan | string uppercase ≤10 | |
| taxPref | 'Taxable'\|'Tax Exempt' | stored, NOT used in tax math |
| currency, openingBalance, paymentTerms | — | openingBalance stored, not summed into receivables; PAYMENT_TERMS data.js:141-145 |
| branch | branchId | else area-matched via clientBranch — store.js:552-561 |
| portal | bool | portal access |
| billing | {attn,country,street1,street2,city,state,pin,phone} | billing.state is tax fallback — store.js:434 |
| site | same shape | each field falls back to billing at save — clients.js:446-451 |
| persons | [{sal,first,last,email,work,mobile}] | rows kept only if first\|\|last\|\|email\|\|mobile — clients.js:430-437 |
| docs | [{name,size,type,data:dataURL}] | ≤1200KB each (MAX_DOC_KB clients.js:77) |
| remarks | string | internal only |
| addr, city, pin | string | flat addr = billing street1+', '+street2 — clients.js:491; city default 'Chennai' |
| area | string | property-size text, default '—' |
| since | ISO | created date |
| color | hex | 7-palette by index |

### 1.8 lead
| Field | Type | Notes |
|---|---|---|
| id | 'LD-nnnn' | seq.lead — leads.js:876-878 |
| name, phone | string REQUIRED | leads.js:867-869 |
| email | string optional | |
| source | leadSources master | seed LEAD_SOURCES ['WhatsApp','Call','Website','Referral','Walk-in','Instagram','JustDial'] data.js:368; default 'WhatsApp' |
| type | propertyTypes master | data.js:369; default 'Residential' |
| area | string | defaults 'Chennai' when blank — leads.js:882; drives branch auto-select |
| interest | svcId[] | may be empty ('Not confirmed yet') |
| stage | 'new'\|'followup'\|'inspection'\|'quoted'\|'contract'\|'won'\|'lost' | LEAD_STAGES colors #2E90FA/#0891B2/#6366F1/#F79009/#7C3AED/#12B76A/#94A3B8 — data.js:372-380 |
| value | number ₹ | Σ catalogue price of ticked interest services at capture — leads.js:872 |
| branch | branchId | auto from area until select touched — leads.js:777-787 |
| owner | userId | must be assignableUser (sales/ops/admin); default capturer if assignable else 'U03' — leads.js:18-21 |
| created | ISO | |
| note | string | 'Not interested: <why>' appended on lost — leads.js:522 |
| followUp / followUpTime | ISO / 'HH:MM' (default '10:00') | only meaningful in stage followup; cleared on other transitions |
| inspectAt / inspectTime / inspectBy | ISO / 'HH:MM' / userId (tech\|ops) | stage inspection booking — leads.js:347 |
| clientId | client id | set on phone-match capture or promotion — store.js:1323 |
| contractId | contract id | set on won (leads.js:618) and by conversion (store.js:1354, amcform.js:786-799) |
| log | [{at:'YYYY-MM-DD(THH:MM)', text, by:userId\|''}] | newest-first (unshift) — leads.js:94-97, quotations.js:1566-1573; detail shows first 8 |

### 1.9 quotation
| Field | Type | Notes |
|---|---|---|
| id | 'QT-nnnn' | seq.quote; user-typed id kept if unique else fallback — quotations.js:582-587 |
| clientId XOR leadId | string\|null | party; portable-link copies null both and use _party |
| date / valid | ISO | defaults today / +15 days (Seed.D(15)) — quotations.js:268-269 |
| owner | userId | salesperson; profile signature auto-signs |
| refNo | string | customer PO/enquiry ref |
| placeOfSupply | STATES entry | |
| branch | branchId | |
| terms | string[] | prefilled from company.terms — quotations.js:596. **QUIRK: docHtml & quotePdf print co.terms, not q.terms** (quotations.js:710,992) |
| status | 'draft'\|'sent'\|'approved'\|'rejected' | QUOTE_STATUS also defines display-only 'expired' (b-amber) which nothing ever assigns — store.js:389-395; expiry is computed from valid |
| title | string REQUIRED | auto 'Pest Management Proposal — <party>' |
| mode | 'amc'\|'onetime' | default amc |
| freq | string legacy | builder saves ''; seeds carry real labels; printed in PDF type row |
| months | int | amc: max(item.months)\|\|12; onetime: 0 — quotations.js:600-601 |
| items | quoteItem[] | see below |
| discount | number ₹ absolute | pre-tax |
| notes | string | decline reason appended 'Declined by customer: <note>' — quotations.js:1562 |
| signCustomer / signExec | PNG dataURL | exec: owner's on-file sign wins over drawn — quotations.js:606-607 |
| sentAt / sentTo / attachments | nowStamp / phone / [pdfName] | markSent — quotations.js:1203-1209 |
| decidedAt | nowStamp | customer approve/decline — quotations.js:1560-1561 |
| contractId | string | set on conversion; freezes editing |
| _party | transient {name,contact,addr,city,pin,gstin,phone,email,placeOfSupply} | carried by portable ?d= link — quotations.js:20-25,791 |

**quoteItem**: {svId (nullable=custom), name, desc, qty (float, step .5), rate, unit, visits (int≥1), months (int≥1 default 12)} — quotations.js:565-579. months/visits are read by planFromQuote (store.js:1160-1161) so per-line cadence survives conversion.

### 1.10 contract
| Field | Type | Notes |
|---|---|---|
| id | 'AMC-YYYY-NN' or 'OTS-YYYY-NN' | pad2 from seq.contract; user-typed kept if unique else auto — amcform.js:696-698, store.js:1328 |
| clientId | FK client | |
| quoteId | string\|null | conversion back-link |
| leadId | string\|null | |
| mode | 'amc'\|'onetime'\|absent | absent = AMC (pre-split seed) — contracts.js:15, delivery.js:15 |
| refNo, placeOfSupply, discount | string / state / ₹ | discount = clamped pre-tax value — amcform.js:702-704 |
| start / end | ISO | one-time: end===start; AMC: end = user-set or start+months — amcform.js:706-707 |
| months | int | 0 one-time; else round(daysBetween(start,end)/30.44) min 1 — amcform.js:148,708 |
| freq | string | legacy single cadence; 'One-time' for one-time, '' for new AMC form |
| serviceIds | svcId[] | all lines |
| plan | planLine[] | legacy-modal one-time: []; unified-form one-time carries a plan never used to generate |
| mergeSameDay | bool default true | |
| workdaysOnly | bool default true | = skip Sundays only (Mon-Sat working) |
| blackout | ISO[] | always [] from forms |
| value | int ₹ | Math.round(total INCLUDING GST) — amcform.js:727 |
| billing | string | 'On completion' one-time; AMC unified form hardcodes 'Quarterly'; legacy modal select Monthly/Quarterly/Half-Yearly/Yearly — amcform.js:728, contracts.js:559 |
| owner | userId | default me.id if sales/ops/admin else 'U03'; quoteToContract hardcodes 'U02' — store.js:1341 |
| techId | userId\|'' | legacy single tech; = first crew of first staffed line, maintained by syncCrew — store.js:472 |
| branch | branchId | |
| site | string | client.addr snapshot at creation |
| scope | string REQUIRED | subject/description |
| slot | 'HH:MM' | one-time booking start; AMC first line slot; default '10:00' |
| slotEnd | 'HH:MM' | one-time only; default slot+120min |
| notes | string | printed + shown to tech |
| terms | string[] | snapshot; company.terms else 5 FALLBACK_TERMS — amcform.js:20-30,737 |
| agreedAt | 'YYYY-MM-DDTHH:MM' | |
| signCustomer / signExec | dataURL | exec prefers owner's on-file profile signature — amcform.js:666-667 |
| crew | int | peak crew stored at creation = peakCrew(lines, planVisits) — amcform.js:741 |
| totalVisits | int | set by applyPlan (= count of contract jobs), or 1 one-time — store.js:1294 |
| shared | bool | legacy modal only — contracts.js:570 |

### 1.11 planLine
| Field | Type | Notes |
|---|---|---|
| svId | FK service | |
| freq | label | human cadence recomputed from spread |
| months | int | 0/absent = whole contract term; lineMonths = max(1, l.months \|\| c.months) — data.js:458, amcform.js:180 |
| visits | int ≥1 | number of visits sold for the service (= AMC qty) |
| mins | int | svc.mins\|\|60 |
| dayRule | string 'dom:N' | only dom: implemented; string so 'nth:2:SAT'/'gap:45' can come later — data.js:466-478 |
| slot | 'HH:MM' default '10:00' | |
| crew | int 1-9 | technicians the service takes |
| techIds | userId[] | ALWAYS read via lineCrew clamp; legacy techId read-only, deleted on assignment save — contracts.js:998-1001 |
| startAt | ISO optional | line's first-visit date, default contract start — data.js:459 |
| dropped | transient string[] | techs pushed off on crew reduction; toasted then deleted — contracts.js:269-272,680-689 |

### 1.12 job
| Field | Type | Notes |
|---|---|---|
| id | 'JOB-nnnn' | nextId('job','JOB-',4) — store.js:1081-1086,1275 |
| type | 'AMC Visit'\|'One-Time'\|'Callback'\|'Complaint'\|'Inspection' | JOB_TYPE map store.js:402-408 |
| contractId | string\|null | null = standalone job (counted in one-time module) |
| clientId | FK client | |
| serviceIds | svcId[] | AMC: union of merged plan lines; unified one-time: ALL lines; legacy modal one-time: picked.slice(0,2) — contracts.js:584 |
| date / slot | ISO / 'HH:MM' | slot snapped to 15min by placeJob |
| slotEnd | 'HH:MM' | one-time only |
| mins | int default 60 | AMC merged Σ line mins; one-time windowMins = slotEnd−slot else 120 |
| techIds | userId[] | [] = unassigned queue; deduped+clamped by placeJob |
| status | 'scheduled'\|'enroute'\|'inprogress'\|'completed'\|'cancelled' | JOB_STATUS store.js:382-388 (blue/violet/amber/green/gray) |
| priority | 'urgent'\|'high'\|'normal'\|'low' | UI sets normal/high; autoAssign ranks all 4 |
| visitNo / ofVisits | int | AMC counter renumbered by applyPlan; 0/0 for non-AMC |
| planRef | string[] '<contractId>#<svId>' | plan-line provenance — data.js:583 |
| plannedAt | ISO | date the plan put it on — store.js:1191 |
| pinned | bool | hand-placed on board → frozen against plan engine — store.js:648,659,1176-1182 |
| notes | string | technician instructions |
| exec | object\|null | execution record (below); null until tech starts |

### 1.13 job.exec
| Field | Type | Notes |
|---|---|---|
| checkinAt / startedAt / finishedAt | 'YYYY-MM-DDTHH:MM' | nowStamp; finishedAt null until finish |
| durationMins | int | minutesBetween(startedAt, finishedAt) \|\| 1 |
| geo | string | 'lat.toFixed(4)° N, lng.toFixed(4)° E' or random fallback '13.0(300-699)° N, 80.2(300-699)° E' — jobs.js:539-552 |
| photosBefore / photosAfter | dataURL[] | JPEG resized max 520px q0.72 — jobs.js:17-32 |
| chemicals | [{id:itemId, qty:number}] | consumed from stock at finish |
| findings | string[] | subset of Seed.FINDINGS (10 canned) — data.js:674-680 |
| observations | string | free text |
| signedBy | string | prefilled client.contact |
| signature | bool | **only a boolean is persisted, not the strokes** |
| rating | 1-5 | defaults 5 if not tapped; feeds kpis + leaderboard — store.js:1017-1018,1074 |
| feedback | string | seed-only; no UI writes it |

### 1.14 inventory item
| Field | Type | Notes |
|---|---|---|
| id | 'INnn' | 'IN'+(inventory.length+30) — inventory.js:96 |
| name | string REQUIRED | |
| cat | 'Chemical'\|'Equipment'\|'Consumable' | |
| ai | string | active ingredient |
| unit | string default 'nos' | |
| stock / min | number | stock < min = low stock — kpis store.js:1010 |
| cost | number | unit cost ₹ |
| pack, supplier | string | pack default '—' |
| batch | string default '—' | updated on purchase |
| expiry | ISO or '' | |
| cib | string | CIB&RC registration no. |

### 1.15 stockMove
| Field | Type | Notes |
|---|---|---|
| id | 'SM-'+random(500-1399) | **RANDOM, collision-prone** — store.js:1401, inventory.js:53 |
| date | ISO | |
| itemId, qty | FK, signed number | + purchase / − issue/consume |
| type | 'Purchase'\|'Issued'\|'Consumed' | |
| ref | PO text (Purchase) / TECH USERID (Issued, rendered via userName) / jobId (Consumed) | |
| by | userId | recorder |

### 1.16 audit
| Field | Type | Notes |
|---|---|---|
| id | 'AUD-nnn' | seq.audit=(seq.audit\|\|100)+1 — audits.js:66 |
| type | one of 3 AUDIT_TEMPLATES keys | 'Site Quality Audit' (7 pts), 'Safety & Compliance Audit' (7), 'Pest Trend Audit' (5) — data.js:950-977 |
| clientId | FK | |
| contractId | auto = client's first contract or null — audits.js:69 | |
| jobId | always null in v1 | |
| date | ISO | |
| auditorId | admin/ops user | |
| status | 'draft'\|'completed' | |
| items | [{t:text, v:''\|'pass'\|'fail'\|'na', r:remark}] | copied from template |
| remarks | string | autosaved on input |

### 1.17 invoice
| Field | Type | Notes |
|---|---|---|
| id | 'INV-nnnn' | nextId('invoice','INV-',0) |
| clientId | FK | |
| contractId | string\|null | |
| date / due | ISO | invoiceFromContract: due = today+15d |
| period | string | billing-period label |
| items | [{name, qty, rate}] | rate is EX-GST; **no discount field** (quotes only) |
| status | 'paid'\|'partial'\|'unpaid'\|'overdue' | DERIVED — syncInvoiceStatus store.js:955-961; never trust stored |
| placeOfSupply | optional | supplyState precedence input |

### 1.18 payment
| Field | Type | Notes |
|---|---|---|
| id | 'RCP-nnn' | nextId('receipt','RCP-',0) |
| invoiceId | FK | |
| date | ISO | defaults today, user-overridable AFTER creation — invoices.js:104 |
| amount | int (incl GST) | Math.round; NOT capped at balance (overpay allowed; balance clamps 0) |
| mode | 'UPI'\|'Bank Transfer'\|'Cash'\|'Cheque'\|'Card' | MODES invoices.js:12 (store seed also 'Bank Transfer'/'Cheque'/'Cash'/'UPI') |
| ref | string default '—' | |
| by | userId | me().id fallback 'U07' — store.js:1385 |

### 1.19 notification
| Field | Type | Notes |
|---|---|---|
| id, icon, tone, title, body | string | tone red\|green\|amber\|blue\|violet\|brand\|gray |
| at | freeform relative string ('2 min ago', 'just now') | display-only |
| unread | bool | mark-all-read sets false — app.js:435-444; runtime rows unshifted (e.g. portal request portal.js:440-446) |

### 1.20 waTemplate
| Field | Type | Notes |
|---|---|---|
| k, label, on, trigger, vars[], body | — | 8 templates: quote_sent, quote_followup, visit_reminder, tech_enroute, service_report, invoice_raised, payment_receipt, amc_renewal — data.js:1065-1115 |

fillTemplate replaces `{word}` tokens; missing vars stay literally visible — store.js:96-101. **QUIRK: seed bodies greet `{customer}` but fill maps supply key `client` → `{customer}` renders unreplaced** (data.js:1070 vs quotations.js:850, settings.js:281). Decide: preserve or fix.

### 1.21 Computed (not stored)
| Shape | Fields | Source |
|---|---|---|
| planVisit | {date, movedFrom:''\|ISO, serviceIds[], techIds[], planRef[], mins(Σ), slot(earliest), lines} | planVisits data.js:568-588 |
| directory row | {kind:'client'\|'lead', id, clientId, name, phone, email, area, type, since} | store.js:206-231 |
| quote-link payload (?d=) | {q:[id,date,valid,title,mode,months,refNo,placeOfSupply,owner,branch,discount,notes,status,signCustomer,signExec], items:[svId,qty,rate,visits,months], p:[name,contact,addr,city,pin,gstin,phone,email,placeOfSupply]} | packQuote quotations.js:770-780; descriptions & terms deliberately omitted, rebuilt on unpack |
| sig state | {key:{inked, data:dataURL\|'signed'\|'', clear}} | comp.js:200-262 |
| undo entry (board) | {label, entries:[{jobId, before:{date,slot,techIds,pinned}}]} | board.js:421-431 |

### 1.22 Master lists (Seed constants)
| List | Values / Source |
|---|---|
| LEAD_SOURCES | data.js:368 |
| PROPERTY_TYPES | data.js:369 |
| LEAD_STAGES | [{id,label,color}] data.js:372-380 |
| SALUTATIONS / CUSTOMER_TYPES / LANGUAGES / CURRENCIES | data.js:123-126 |
| GST_TREATMENTS | 9 values data.js:129-139: Registered Business - Regular / - Composition, Unregistered Business, Consumer, Overseas, Special Economic Zone, Deemed Export, Tax Deductor, SEZ Developer |
| PAYMENT_TERMS | data.js:141-144: Due on Receipt, Net 15/30/45/60, Due end of the month, Due end of next month |
| STATES | 36 Indian states/UTs data.js:147-154 |
| COUNTRIES / RELATIONS / BLOOD_GROUPS / EMP_TYPES | data.js:156-160 |
| ROLES | data.js:216-223 |
| FREQS | ['Monthly','Bi-Monthly','Quarterly','Half-Yearly','Yearly'] data.js:428 |
| FREQ_MONTHS | {Monthly:1, Bi-Monthly:2, Quarterly:3, Half-Yearly:6, Yearly:12} data.js:427 |
| FINDINGS | 10 canned findings data.js:674-680 |
| SLOTS (job forms) | ['06:00','08:00','09:00','10:00','11:00','12:00','14:00','15:30','17:00','18:30','20:00','22:00'] — jobs.js:14, amcform.js:12-13 (labelled 2-hour windows) |
| Portal slots | [08:00,10:00,12:00,14:00,16:00,18:00] — portal.js:381-401 |

### 1.23 SERVICE_META
{SVnn: {freq, checklist[]}} — default cadence + tick-list per service — data.js:251-334. Visit checklist = union of its services' checklists.

### 1.24 db.seq
{job, quote, contract, invoice, receipt, lead, audit}. Demo: {job:~980+, quote:2043, contract:8, invoice:3312, receipt:881, lead:1042, audit:119}. Fresh: {job:1000, quote:1000, contract:0, invoice:1000, receipt:100, lead:1000, audit:100} — data.js:1159-1161. Incremented by nextId — store.js:1081-1086.

**ID generation summary (v2: DB sequences everywhere, same prefixes/padding):**
| Kind | Pattern | v1 mechanism |
|---|---|---|
| job | JOB- pad4 | seq ✔ |
| quote | QT- | seq ✔ (typed id kept if unique) |
| contract | AMC-YYYY-NN / OTS-YYYY-NN pad2 | manual '++seq.contract' — store.js:1328, amcform.js:695-698 |
| invoice | INV- pad0 | seq ✔ |
| receipt | RCP- pad0 | seq ✔ |
| lead | LD- | seq ✔ |
| audit | AUD- | seq ✔ |
| client | CL- pad3 | **array length+1 (collides after delete)** |
| user | U pad2 | array length+1 |
| service | SV pad2 | array length+1 |
| branch | BR-NN | first-free scan |
| stockMove | SM- | **random 500-1399** |

---

## 2. BUSINESS RULES

### 2.1 Storage, versioning, migration
- **Version gate**: load() uses stored db only if parsed.v === 16, then migrate(); any parse failure or mismatch reseeds Seed.build({demo:true}) — store.js:14-27. reset(demo) rebuilds with/without sample work — store.js:59-63.
- **Migration pattern**: in-place fixes applied only where still applicable, never touching user edits — e.g. waTemplates 'quote_sent' body replaced only if it still contains 'attached to this message as a PDF'; save only if dirty — store.js:34-48.
- **Storage budget**: STORAGE_CAP_KB = 5*1024; storageWouldOverflow(addKB) = dbSizeKB()+addKB > cap*0.92 (92% headroom); checked before any attachment write — store.js:109-122. Callers pass fileKB*1.37 (base64 overhead) — clients.js:403, services.js:200. Per-file caps: customer doc 1200KB, service PDF 1500KB. v2: real storage, keep per-file limits configurable.
- shrinkImage: images downscaled to max 520px (caller-overridable: photo 320 / sign 520 / doc 900), JPEG q0.72 — ui.js:211-226, team.js:144/159/321.

### 2.2 Money, dates, formatting
- money(): Math.round, en-IN grouping, '₹' prefix (opts.bare drops it), minus outside symbol — store.js:277-282.
- moneyShort: ≥1e7 → '₹X.XX Cr' (strip .00); ≥1e5 → 'L'; ≥1e3 → 'K' 1-decimal (strip .0) — store.js:283-289.
- amountInWords: Indian crore/lakh/thousand grouping + ' Rupees Only'; 0 → 'Zero Rupees Only' — store.js:304-316.
- Dates stored 'YYYY-MM-DD' local (Seed.iso data.js:12-15); parse() builds local Date — store.js:326-330; daysBetween = Math.round((b−a)/86400000) — data.js:31-33; addMonths uses JS Date overflow semantics — data.js:21-25.
- relDay: 0 Today, ±1 Tomorrow/Yesterday, 2-6 'In n days', −2..−6 'n days ago', else 'D Mon YYYY' — store.js:338-346.
- fmtTime 12h h%12||12 + AM/PM — store.js:348-356; durationText <60 → 'Nm min' else 'Xh'+(' Ym') — store.js:365-370; minutesBetween = max(0, round((b−a)/60000)) — store.js:371-374; nowStamp = todayISO+'T'+HH:MM local — store.js:375-379.
- toMin('HH:MM')=h*60+m; toHHMM clamps [0, 24*60−1] — store.js:516-523.
- timeAgo: <1min 'just now', <60 'N min ago', <24h 'N hr(s) ago', <30d 'N day(s) ago', else fmtDate — ui.js:415-427.

### 2.3 GST / tax
- homeState() = company.state || 'Tamil Nadu' — store.js:420-422.
- supplyState(rec): rec.placeOfSupply → client.placeOfSupply → client.billing.state → homeState — store.js:428-436.
- isInterState = trimmed case-insensitive inequality vs homeState — store.js:442-444. inIndia(place): empty→true, else must equal a STATES entry case-insens — store.js:489-493.
- taxSplit(taxable, place): rate = company.gstRate || 18; gst = max(0,taxable)*rate/100; intra: cgst=sgst=gst/2, igst=0; inter: igst=gst; half=rate/2 — store.js:477-486.
- taxRows: inter → [['IGST {rate}%', igst]]; else [['CGST {half}%',cgst],['SGST {half}%',sgst]] — store.js:927-930.
- **Quote totals**: sub=Σ(qty*rate); disc=q.discount||0; taxable=max(0, sub−disc); total = taxable + gst(taxable, supplyState(q)) — store.js:932-943.
- **Invoice totals**: sub=Σ(qty*rate) (no discount); total = sub+gst; paid = Σ payments matching invoiceId; balance = max(0, total−paid) — store.js:944-954.
- **Invoice status** (derived, recompute on every read): balance ≤ 0.5 → 'paid'; else paid > 0 → 'partial'; else dayDelta(due) < 0 → 'overdue'; else 'unpaid' — store.js:955-961. Recomputed on list render, detail render, kpis, accounts dashboard.

### 2.4 Visit-generation engine
- **planLine defaults** (data.js:495-514): freq = override.freq || svc.defaultFreq || 'Monthly'; visits = max(1, round((c.months||12)/FREQ_MONTHS[freq])); mins = svc.mins||60; dayRule = 'dom:'+dayOfMonth(c.start); slot = override||c.slot||'10:00'; crew = max(1, o.crew||1); techIds = o.techIds ?? [o.techId] ?? [c.techId] ?? []. defaultPlan(c) = Seed.planFor over serviceIds — store.js:1131-1133, data.js:516-523.
- **lineSpread(line,c)** (data.js:457-464): months = line.months||c.months||12; from = line.startAt||c.start; term = max(1, daysBetween(from, addMonths(from,months))); visits = max(1, line.visits || round(months/(FREQ_MONTHS[line.freq]||1))); gap = term/visits.
- **applyDayRule** (data.js:471-478): only `/^dom:(\d{1,2})$/`; day clamped [1..lastDayOfMonth]; unknown rule → date unchanged.
- **nextAllowedDay** (data.js:481-492): while (workdaysOnly!==false && Sunday) OR date∈blackout, advance 1 day; hard guard 21 iterations. workdaysOnly = skip Sundays ONLY.
- **planVisits(c)** — THE generator, pure, shared by seed/preview/apply (data.js:541-565): merge = c.mergeSameDay !== false. Per line: byMonth = (gap ≥ 28). byMonth: step = max(1, round(months/visits)) months; wanted = applyDayRule(addMonths(from, v*step), dayRule) — keeps 'always the 5th' anchor. Else: wanted = addDays(from, round(v*term/visits)) — even day spread. date = nextAllowedDay(wanted, blackout, workdaysOnly); skip if c.end && date > c.end. Group key = merge ? date : date+'|'+svId.
- **Merge semantics** (data.js:568-588): serviceIds union; techIds = dedup union of lineCrew(l); planRef entry per line '(c.id||"NEW")#svId'; mins = Σ line mins; slot = lexicographically earliest line slot (else c.slot||'10:00'); movedFrom = original date when Sunday/blackout pushed; sorted by date then slot.
- **cadenceLabel(gapDays, visits)** (data.js:444-454): visits===1 → 'One-time'; gap within ±12% of [30 Monthly, 61 Bi-Monthly, 91 Quarterly, 182 Half-Yearly, 365 Yearly] → label; 7-8d → 'Weekly'; 14-16d → 'Fortnightly'; else 'Every N days'.
- **Frozen/pinned**: FROZEN = ['completed','inprogress','enroute']; isFrozen(j) = status∈FROZEN || j.pinned — store.js:1176-1182. pinned=true by placeJob/resize; false by unassignJob/Unpin. Hand placement outranks the engine.
- **planDiff(c)** (store.js:1198-1228): proposed = planVisits(c); jobs split frozen (indexed by date) vs open (FIFO-bucketed by date). Proposed visit on a frozen date → skipped entirely; else pop first open job that date, 'keep' iff mins && slot && serviceIds.join() && techIds.join() all equal, else 'update'; no open job → 'add'. Leftover open jobs → 'remove'.
- **applyPlan(c)** (store.js:1263-1297): splice removes; stampJob updates (serviceIds, techIds = pv.techIds else [c.techId], slot, mins, planRef, plannedAt — store.js:1184-1192); adds → {id:nextId JOB- pad4, type:'AMC Visit', status = dayDelta(date)<0 ? 'completed' : 'scheduled', priority:'normal', notes:c.notes, exec:null}; renumber ALL contract jobs by date order visitNo=i+1, ofVisits=count; c.totalVisits = count; returns {made, added, updated, removed, kept, frozen}.
- **planWarnings(c)** (store.js:1231-1259): pinned-not-frozen count → ok 'left exactly where they are'; movedFrom count → warn 'moved off a Sunday'; visits with no techIds → warn; tech with ≥4 other same-day services → crit clash (max 3 listed) — store.js:1250-1251; empty visit list → crit 'produces no visits at all'.
- **generateVisits(c)**: plan missing → plan = defaultPlan(c); then applyPlan(c).made — store.js:1300-1303.
- **planSummary(c, short)** (store.js:1116-1128): no plan → c.freq||'—'; group service codes by freq; one freq → its name; short → 'N intervals'; else 'CODE/CODE monthly, CODE quarterly'.
- **freqForVisits(months, visits)** (store.js:1137-1144): FREQ minimizing |round(months/FREQ_MONTHS[f]) − visits|; ties keep earlier (Monthly first); default 'Monthly'.
- **planPreview** (contracts.js:279-306): '<Σ line.visits> service-visits → <visits.length> trips'; merged = visits with lines>1; total mins; first 8 date chips + '+N more'; red banner on empty plan.
- **Plan editor readPlan clamps** (contracts.js:255-275): visits [1,120]; months ≥1 default c.months||12; freq recomputed via cadenceLabel(lineSpread); dayRule 'dom:'+clamp(1,31); slot default '10:00'; crew [1,9]; lowering crew below assigned drops tail into line.dropped, truncates techIds, dropped names toasted.

### 2.5 Crew model
- **lineCrew(l)** — single read-path (data.js:532-539): techIds (filtered truthy) else [techId]; ALWAYS `.slice(0, max(1, l.crew||1))` so stored data can never render '3 of 2'.
- **jobCrewSize(j)** (store.js:702-712): no contractId → max(1, techIds.length); contract gone → 1; else max over plan lines whose svId ∈ job.serviceIds of (l.crew||1).
- **peakCrew(lines, visits)** (store.js:870-884): a day needs its BIGGEST service (max of line crews present that day), NOT the sum; contract peak = max over visits; no visits yet → max single line crew. contractCrew(c) = 0 if no plan else peakCrew(c.plan, planVisits(c)) — store.js:886-890.
- **staffing(c)** (store.js:898-920): per line need = max(1, crew); have = lineCrew(l); short = max(0, need−have.length); over = max(0, have.length−need) (over NOT clamped away); ok = no shorts && no overs && rows>0; missing = Σ short; extra = Σ over. understaffed() = contracts with plan && !ok — store.js:922-925.
- **syncCrew(c)** (store.js:455-475): re-stamp techIds on every NON-FROZEN contract job = union of lineCrew per service on the job, clamped slice(0, max(1, jobCrewSize(j))); frozen jobs skipped and counted in syncCrew.held; c.techId = first line's first crew member || ''. Must test isFrozen (not status alone) or dispatcher drags get overwritten.
- **Assign modal** (contracts.js:869-1010): working copy picked[svId] = lineCrew(l).slice(); mates map from planVisits (services sharing any trip date); alreadyGoing(svId) = union of picks on trip-sharing services; chips sorted on-trip first; pick beyond need shift()s OLDEST pick out, capped at crew. Save: l.techIds = picked.slice(0, need); delete l.techId; syncCrew; toast '<n> pending visits updated · <held> hand-placed left alone · <missing> still to fill'.

### 2.6 Dispatch engine
- Constants: DAY_FROM = 6*60, DAY_TO = 22*60, SNAP = 15 min — store.js:512-514.
- **workHours(u)** (store.js:529-538): user.hours field-by-field over company.hours over {from:'09:00', to:'18:00', days:[1,2,3,4,5,6]}; empty user days array falls back.
- **onDuty(u,date,from,to)** (store.js:541-548): dow ∈ days AND from ≥ workFrom AND to ≤ workTo; {ok, why:'not a working day'|'starts before X'|'runs past X'}.
- **dropCheck(job, techId, date, startMin)** — warnings never refuse (store.js:580-630): (1) time overlap with tech's other job (start<b && end>a) → level 'block' 'Clashes with {id}'; (2) !onDuty → warn 'Outside working hours — {why}'; (3) skills: service names vs u.skills lowercase substring BOTH directions; warn 'Not listed for …' only if ALL services unmatched; (4) job branch ∉ u.branches (when tech has branches) → warn 'Different branch'; (5) travel: adjacent job within **30 min** before/after → warn 'Only N min …' — store.js:622. mins defaults 60.
- **placeJob(jobId, techIds|null, date, startMin)** (store.js:636-651): slot = toHHMM(round(startMin/SNAP)*SNAP); techIds deduped then clamped slice(0, max(1, jobCrewSize)); **pinned = true**; returns before-snapshot {date, slot, techIds, pinned} for undo.
- **unassignJob** (store.js:654-662): techIds=[], pinned=false; returns before-snapshot. restoreJob/undoBatch restore snapshots exactly — store.js:845-857.
- **freeGaps(techId, date, buffer=20)** (store.js:669-689): [] if not a working day; busy = each job expanded ±buffer min, merged left-to-right over [workFrom..workTo]; only positive-length gaps. Board overlays require ≥45 min.
- **firstFree(techId, date, mins=60, notBefore=0)** (store.js:692-700): first gap where max(gap.from, notBefore)+mins ≤ gap.to; result rounded UP to SNAP (ceil); null if none.
- **suggestTechs(j, date, limit)** (store.js:718-764): role='tech' only; base 100; not working that dow −80 'Not working today'; covers job's branch +26; has branches but not job's −22; skills ≥1 matched +18 'Does X', none −16; load pct = booked/max(60, workTo−workFrom), score −= round(pct*45), 'good' when pct<0.8; no gap long enough (only when working) −55 else 'Free from HH:MM'; sort desc; row = {user, score, at, why[{good,text}], booked, avail}.
- **autoAssign(date)** (store.js:771-801): queue = unassignedOn(date) sorted priority rank {urgent:0, high:1, normal:2 (default), low:3} then longer mins first; per job crew = jobCrewSize; ranked = suggestTechs filtered at≠null; <crew → skip; take top crew; converge common start: start = max(at); loop ≤8: recompute firstFree(each, mins, start), any null → fail, all equal → place; placeJob(ids, date, start) (thus pinned). Returns {placed:[{jobId,before}], skipped:[job]}. unassignedOn = same-date, not cancelled, empty techIds — store.js:571-574.
- **balanceDay(date)** (store.js:808-843): ≤12 passes; per tech {booked=Σmins, avail=max(60, to−from), over=booked−avail}; stop when worst.over ≤ 0; candidate = worst tech's LATEST-slot job, status ∉ {completed, inprogress}, exactly 1 tech (never split a crew); taker = other techs with firstFree AND booked+mins ≤ avail, least-booked first; placeJob(cand, [taker], date, taker.at). Returns moved [{jobId,to,before}].
- **jobsOn(date, techId?)** (store.js:974-978): date match + techIds membership, sorted by slot. **Does NOT exclude cancelled** (board filters cancelled itself; schedule + assign-modal counts include them).
- Branch routing: areaKey = lowercase, non-alnum→space, trim — store.js:153-155. **branchForArea(area)** (store.js:169-190): among active branches: (1) exact area-key match in branch.areas, (2) substring either direction, (3) fallback substring on branch name/addr; else null. **clientBranch(cl)** (store.js:552-561): explicit cl.branch wins; else split addr+', '+city on commas, walk segments LAST→FIRST through branchForArea; else first branch. **jobBranch(j)** = contract.branch else clientBranch(client) — store.js:564-568.

### 2.7 Dispatch board UI rules (board.js)
- Span stretches for outliers: lo=min(DAY_FROM, job starts), hi=max(DAY_TO, min(1440, start+mins)); from=floor(lo/60)*60, to=ceil(hi/60)*60; dayMins=max(60, to−from) — board.js:38-53.
- Zoom: RAIL=190px; ZOOMS={s:1.2, m:2.2, l:3.6, xl:6} px/min; 'fit' uses percentages; drag scale read back off DOM (laneRect.width/dayMins) — board.js:20-70,666. Hour label step 120min when (fit && dayMins>12h) || pxMin<1.5 else 60 — board.js:279. Minute 1440 renders '12:00 AM'.
- Now line only when date===today && dayFrom ≤ nowMin ≤ dayTo — board.js:71-77,283-286.
- Bar: width = len(max(20, min(dayTo, start+mins)−start)); '· past midnight' suffix when start+mins > dayTo; tones {completed:done, inprogress/enroute:live, scheduled:plan, cancelled:off}; locked (no drag/resize) when completed|inprogress; pinned lock icon; priority high|urgent alert icon; crew>1 '· crew N' — board.js:130-163.
- Filter chips DIM only, never remove: prio → keep high|urgent; 'open' → dim completed; 'live' → dim all but inprogress|enroute — board.js:108-114.
- Tech load: booked = Σ(mins||60); avail = max(60, span); off = dow not in days; pct; over = booked>avail — board.js:116-127.
- Summary: util = round(ΣbookedAll/ΣavailAll*100), availAll EXCLUDES off-day techs; util badge warn >85, bad >100; '· N over hours' — board.js:266-276,327-333.
- Branch grouping in db.branches order; leftovers under pseudo {_none,'No branch'}; collapse per branch — board.js:93-103.
- Week strip: offsets −3..+3; job counts (non-cancelled); amber dot when any unassigned — board.js:184-201.
- Run sheet hop: hop = start − (prevStart + prevMins); <0 'overlaps the last job by X'; ===0 'straight on to the next'; >150 'X free'; else 'X to get there'; class 'tight' when <15 — board.js:219-230.
- Drag threshold 4px; tap bar → popover; tap queue card → suggest modal; dblclick → job detail — board.js:744-748, 800-804, 917-921. Pointer events + setPointerCapture; document handlers swapped via window.__bdDoc / __bdKey — board.js:895-915.
- Drop minute: raw = (clientX − laneLeft − grabOffset)/scale + dayFrom; snap 15; clamp [dayFrom, dayTo−15]; grabOffset only for from-lane moves — board.js:668-673,771.
- Completed/inprogress refuse to lift: toast 'That visit is already under way' — board.js:707-713.
- Drop on queue panel = unassign (move mode only) — board.js:763-772,806-813. Drop on lane: dropCheck warnings live in tooltip; 'block' paints lane red **but drop still allowed** — board.js:822-840,855-864.
- Crew-preserving drop: crew>1 → ids = [dropped-on tech] + (previous minus that tech).slice(0, crew−1) — board.js:816-823.
- Queue-drag ghost width = max(90, mins*scale) px — board.js:730-733.
- Resize: mins = max(15, snap15(mins0+delta)); pinned=true; undo entry — board.js:842-884.
- Popover actions: ∓15m nudge via placeJob; Shorter/Longer mins±15 (min 15) + pinned=true direct; Suggest; Unpin (pinned=false); Unassign; Open — board.js:568-655.
- Keyboard: Ctrl/Cmd+Z undo; Escape clear; Arrow L/R ±15min (Shift = 60); Arrow U/D reassign to prev/next tech keeping slot (based on techIds[0]); Delete/Backspace unassign; skipped when focus in input/textarea/select — board.js:930-971.
- Undo stack board-local, cap 20; every mutation pushes {label, entries}; batches (auto-assign/balance) are one step — board.js:420-431.
- Initial hscroll (fixed zoom): scrollLeft = max(0, (firstJobStart − dayFrom)*pxMin − 100) — board.js:975-981.

### 2.8 Sales pipeline (leads)
- OPEN_LEAD_STAGES = ['new','followup','inspection','quoted','contract'] — store.js:194.
- Capture: name+phone required; area default 'Chennai'; stage = 'followup' if follow-up date given (time '10:00') else 'new'; value = Σ catalogue price of ticked services; log seeded 'Lead captured'(+' — returning customer') — leads.js:866-896.
- assignableUsers (owners): roles sales(0) < ops(1) < admin(2), sorted; techs/accounts never own leads — store.js:142-147. Inspection assignees: role tech|ops — leads.js:347.
- Phone match: phoneKey = digits-only last 10 — store.js:199; lookup at ≥10 digits; directory = clients first then leads with unseen phoneKey — store.js:206-231; findContact = phoneKey (≥10 digits) else exact lowercase name — store.js:234-245; contactHistory = leads matching clientId or phoneKey — store.js:248-255. On match: fill name/email/area/type; prior lead's branch+owner override territory map — leads.js:808-825.
- Area→branch auto-select until branch select touched (branchTouched) — leads.js:777-787.
- Kanban: NO drag-drop; stage moves only via call-outcome SOP; column footer TOTAL = Σ value — leads.js:126-147.
- commitment(l): followup+followUp → 'Follow up'; inspection+inspectAt → 'Inspect' — leads.js:63-71. dueState by dayDelta: <0 'Overdue Nd' #F04438; 0 'Due today' #F79009; 1 'Tomorrow' #2E90FA; else 'In n days' — leads.js:73-82. Header dueCount = commitments with dayDelta ≤ 0 — leads.js:84-89.
- **nextStep ladder** (one step only) — leads.js:189-200,603-631: inspection→'quoted' (opens quote builder); quoted→'contract' (commitStage); contract→ leadContracts non-empty ? 'won' : open contract form from ready quote; other → 'choose' (Straight to quotation | Book a site visit).
- SOP Not answered: date default tomorrow, time '10:00'; stage='followup', inspectAt cleared, log 'Call back booked …' — leads.js:471-500.
- SOP Book inspection: stage='inspection'; inspectAt/Time/By (optional nobody); followUp=''; log — leads.js:479-514.
- SOP Not interested: reason REQUIRED; stage='lost'; dates cleared; note += '\n\nNot interested: <why>'; log — leads.js:516-525,589-600.
- commitStage: clears followUp+inspectAt; 'won' also sets contractId = first leadContract + log 'Contract signed — lead won (AMC-…)' — leads.js:572-578,616-621.
- Quote raised on lead: lead.stage='quoted' unless 'won'; followUp='' — quotations.js:611; lead-card callback also clears inspectAt + logs 'Quotation <id> raised — <₹total>' — leads.js:558-567.
- generateAmc from card: 'sent' quote auto-flipped 'approved' before contract form — leads.js:538-544; 'Interested' at contract stage picks first ready (approved|sent) amc-mode quote, else first ready, else error toast — leads.js:607-615.
- leadContracts(l): c.leadId===l.id OR c.id===l.contractId OR c.quoteId ∈ lead's quote ids OR (l.clientId && c.clientId===l.clientId) — store.js:1100-1110.
- Kanban card WA quick action = demo toast only, fixed text — leads.js:934-937.

### 2.9 Quotations
- Builder: party required; title required; items kept if rate>0 || name; months = amc ? max(item.months)||12 : 0; freq=''; ≥1 line enforced; signExec = owner's on-file profile sign || drawn || previous — quotations.js:549-624.
- lineVisits legacy fallback: i.visits || (unit NOT /per visit/i → 1) || max(1, round(qty)) — quotations.js:98-103.
- Visits auto-sync: typing Visits sets data-touched; while untouched, qty edits copy visits=max(1,round(qty)) ONLY for /per visit/i services — quotations.js:487-495,512-517. Service change: rate=svc.price, desc=svc.desc; untouched visits = per-visit ? round(qty) : max(1, round(months/(FREQ_MONTHS[svc.defaultFreq]||1))) — quotations.js:522-543.
- Per-line cadence hint: gap = daysBetween(today, today+months)/visits; visits==1 → 'once, on day one' else cadenceLabel lower + ' · every N days' — quotations.js:469-484.
- Mode toggle: amc shows 'Deliver X times over Y months' strips; onetime hides them — quotations.js:497-500,546.
- List: tabs all/draft/sent/approved/rejected + counts; header '₹Y awaiting customer response' = Σ totals of status 'sent' — quotations.js:38-47. Valid-till cell: dayDelta<0 danger 'expired', <4 warn, else 'N days left' — quotations.js:67,80. Edit pencil hidden when contractId.
- canEdit = role!=='client' && !q.contractId — quotations.js:1373.
- 'Customer approved' (while sent): status='approved'; lead.stage='contract' unless 'won' — quotations.js:1413-1417. 'Mark rejected': status='rejected'; lead.stage='lost' — quotations.js:1419-1422.
- 'Move to contract': draft/sent → confirm dialog → status='approved' + lead→'contract', then contract form; approved goes straight — quotations.js:1424-1449. 'Book the service' (onetime, no contractId) → V.jobs.newJob — quotations.js:1461-1463.
- Duplicate: deep copy, new QT- id, status 'draft', date today, valid +15d, delete contractId — quotations.js:1452-1459.
- Share markSent: draft→'sent' (resend never regresses); sentAt/sentTo/attachments — quotations.js:1203-1209. Open-chat/Desktop-app validate number, auto-savePdf first (paperclip workflow), then wa.me / whatsapp:// — quotations.js:1234-1254. 'Share with files' only when navigator.canShare files; AbortError silent, other failure → savePdf fallback — quotations.js:1079-1084,1258-1278.
- Phone rules: phoneDigits strips non-digits, strips leading 0/00, prepends '91' to bare 10-digit; phoneValid = 11-15 digits; phonePretty '+91 XXXXX XXXXX' — ui.js:291-320.
- WA message = fillTemplate(quote_sent, {client, quote_no, title, amount, valid_date, service_lines ('• name — qty × ₹rate'), approve_link, pdf_link, company, company_phone}) — quotations.js:841-861.
- Links: approveLink = base+'?q=<id>#/approve/<id>'; pdfLink = base+'?q=<id>#/pdf/<id>' (+'&d='+b64url(packQuote) portable); appBase = location.href minus hash/query — quotations.js:758-812. b64url: btoa(unescape(encodeURIComponent(JSON))) with +→-, /→_, = stripped — quotations.js:795-800. quoteFromLink: ?d payload WINS over stored quote (forwarded link shows what was SENT); damaged payload falls back to S.quote — quotations.js:1353-1359.
- Guest access: unauthenticated with ?q= or #/approve|#/pdf → auto-session as first client-role user — app.js:186-189; approve/pdf render BARE — app.js:152-158,328,364-366.
- Approve page decide(): q.status + decidedAt=nowStamp; decline note appended to notes; lead.stage = approved?'contract':'lost'; lead.log 'Customer accepted/declined <id> from the shared link' by:'' — quotations.js:1559-1577. States: decided banner / expired (dayDelta(valid)<0) red banner / Accept (confirm) + Decline (modal, optional reason) — quotations.js:1486-1552.
- quotePdfName = '<id>-<party slug (non-alnum runs → -, trimmed)>.pdf' — quotations.js:1050-1054.
- fullQuotePdf = quotePdf + attach() every UNIQUE quoted service's uploaded sheet whose dataURL meta contains 'pdf' (images skipped); deduped by svId — quotations.js:1024-1036.
- 'Templates' list button = stub toast — quotations.js:1647-1650.

### 2.10 PDF writer / merger
- pdf.js: Helvetica + Helvetica-Bold only (base-14, WinAnsi, not embedded), AFM width tables for align/wrap; non-ASCII folding: ₹→'Rs.', —/–→'-', ‘’→', “”→", •→'-', …→'...', ×→'x', →→'->', ·→'-', other → '?' — pdf.js:42-58. API: page/text/paragraph/line/rect/width/attach/unreadable/bytes/blob/file; top-left coords; PDF 1.4 with xref byte offsets — pdf.js:90-261.
- quotePdf layout: A4 595.28×841.89pt, margin 40, bottom h−64; brand-green #0B7454 86pt header band; item table cols RIGHT−210/−120/RIGHT; per-row pagination via need(); totals block + gray 'Total incl. GST' band; amount in words; NOTES; T&C from co.terms; PAYMENT box; 'computer-generated' line; 'Page N' footer — quotations.js:870-1017.
- pdfmerge.js: own RFC-1951 inflate (object streams only); objects by scanning 'N G obj'; encrypted → refused (null on /Encrypt); ObjStm unpacked; page tree walked inheriting [Resources, MediaBox, CropBox, Rotate], depth 64; importPages renumbers (never following /Parent, depth 96), streams copied verbatim; failure → sheet silently dropped, counted in failed; imported pages land AFTER quote pages — pdfmerge.js:261-368,400-496, pdf.js:193-210.
- Signatures: sigMount canvas 108px × dpr, stroke 2.2px round #0F1729, mouse+touch, toDataURL png, tainted-canvas fallback literal 'signed', seed re-inks on reopen — comp.js:200-256. sigBoxes: onFile signature img + 'On file' badge instead of canvas when user.sign exists — comp.js:168-193. Changing Salesperson re-renders sig section keeping drawn ink — quotations.js:333-340.

### 2.11 Contracts
- isOneTime(c) = c.mode==='onetime'; missing mode = AMC — contracts.js:15, delivery.js:15.
- **everything()** (contracts.js:23-63): all contracts + every contractId-null job as synthetic one-time row {value = Σ service.price, done/total = completed?1:0 / 1, statusKey = done|expired(cancelled)|booked}. Contract one-time status: done when pr.done ≥ pr.total else Booked; AMC uses contractStatus.
- **contractStatus**: d = daysBetween(today, end); d<0 expired; d≤30 'expiring soon'; else active — store.js:410-415. Renew button when daysLeft ≤ 45 — contracts.js:733; amber banner 0≤d≤30, red <0 — contracts.js:737-742.
- **contractProgress**: done = completed count; total = c.totalVisits || jobs.length || 1; pct capped 100 — store.js:967-972. contractJobs sorted date asc — store.js:963-966.
- List: search id+clientName substring; sort end DESC; tabs amc/onetime/active(not expired)/expiring/expired/all; 'Annual value' = Σ value non-expired — contracts.js:67-92. **QUIRK: 'Visits scheduled' stat sums r.totalVisits over rows lacking the field — always renders 0** (contracts.js:106-107; port decision).
- **Unified form (amcform.js)** qty semantics: AMC line qty = VISITS (seeds round(months/FREQ_MONTHS[defaultFreq]); from quote i.visits||i.qty); one-time qty = UNITS SOLD (from quote max(1, i.qty)). CAVEAT: readHeader resets one-time qty=1 (amcform.js:521-525) but readLines runs after (559) so DOM stepper wins. Amount = qty×rate both modes.
- monthsOf(draft) = max(1, round(daysBetween(start,end)/30.44)) — amcform.js:148. lineMonths = max(1, l.months || monthsOf); 0 in 'Runs for' = whole term — amcform.js:180,411-417.
- Form totals: sub = Σ qty*rate; disc = min(max(0,discount), sub); gst = taxSplit(sub−disc, supplyState); total = sub−disc+gst — amcform.js:196-203.
- Schedule preview uses real engine: lineDates(l) = planVisits over that line alone {mergeSameDay:false, workdaysOnly:true}; sharedDates = merged-visit dates with lines>1 (shaded + link icon); asContract() preview {mergeSameDay:true, workdaysOnly:true} — amcform.js:209-245.
- Form defaults: no = prefix+year+'-'+pad2(seq+1); owner = me.id if sales/ops/admin else 'U03'; branch = me.branches[0] || first; start today; end +12mo (AMC) / same day; slot '10:00', slotEnd '12:00'; terms = company.terms else FALLBACK_TERMS — amcform.js:58-79.
- Line interactions: Add service picks first unused catalogue entry — amcform.js:620-626; service change resets rate/desc/qty — 584-596; qty clamp [1,120]; crew clamp [1,9]; moving start keeps period length + resets line startAt — 598-606; subject max 200 + counter — 552-557.
- One-time window: windowMins = slotEnd−slot, fallback 120 when ≤0; job.mins = windowMins — amcform.js:158-162,757-758.
- Validation: customer required; subject required; ≥1 line; one-time date+slot required, slotEnd > slot; AMC daysBetween(start,end) ≥ 28 ('at least a month') — amcform.js:668-690.
- Id/seq: typed no taken → id = prefix+year+pad2(++seq); free → seq++ once, typed used — amcform.js:695-698. Legacy modal: seq always ++, typed-if-unique — contracts.js:530-537.
- Create writes: value = round(total incl GST); billing 'On completion' | hardcoded 'Quarterly'; scope = subject; signExec = ownerSign() precedence; crew = peakCrew; plan line freq = cadenceLabel(spreadOf(l).gap, qty) — amcform.js:693-745.
- One-time creates ONE job directly: type 'One-Time', ALL line svIds, mins=windowMins, techIds [], visitNo 1/1, notes=scope, totalVisits=1 — amcform.js:747-770. AMC calls generateVisits — amcform.js:771. Legacy modal one-time: serviceIds slice(0,2), mins 90, techIds [c.techId] if set — contracts.js:577-595.
- **Quote→contract (amcform path)**: choose({quote}) skips mode question when q.mode exists — amcform.js:806-813. Carries quoteId, leadId, clientId, subject=q.title, branch, owner, terms, refNo, place, discount, notes, signatures, lines (per-mode qty semantics, per-line months), AMC end = start+q.months. Lead promotion in applyQuote: existing client by phoneKey else new CL-nnn; stage→'contract' unless won; l.clientId set — amcform.js:91-143. On create: q.contractId=c.id, q.status→'approved' — amcform.js:775-781.
- **Lead won**: ONLY amcform.js:783-799 sets lead.stage='won' ('a signed contract is the whole point'); lead.contractId=c.id; followUp=''; log unshift '(Contract|Service) <id> created — <n> visit(s) scheduled'; c.leadId back-filled.
- **quoteToContract (store.js:1306-1361, legacy — no live caller)**: promotes lead→client CL-pad3, stage→'contract' unless won; contract id AMC-year-pad2; value = round(quoteTotals.total); months = opts||q.months||12; billing 'Quarterly'; owner 'U02'; slot '10:00'; merge/workdays true; plan = opts.plan || planFromQuote; generateVisits; q.status='approved'; q.contractId; lead.contractId.
- **planFromQuote(q,c)** (store.js:1151-1174): dedupe items by svId; lineMonths = max(1, i.months||c.months); visits = max(1, i.visits || round(i.qty||1)) — quoted qty IS the visit count; freq = cadenceLabel(daysBetween(start, start+lineMonths)/visits); dayRule 'dom:'+dayOfMonth(start); mins = svc.mins||60; slot = c.slot||'10:00'; emits legacy techId.
- **Renewal** (contracts.js:1021-1047): deep JSON copy (keeps plan/crews/signatures/leadId); new id ALWAYS 'AMC-year-NN'; n.start = Seed.addMonths(c.end, 0) — **SAME day old ends (UI copy says 'day after', code says same day)**; n.end = start+months; quoteId=null; generateVisits; navigate.
- **invoiceFromContract** (store.js:1364-1378): cyclesPerYear = FREQ_MONTHS[billing] ? 12/FREQ_MONTHS[billing] : 4; perCycle = round(value/cyclesPerYear); single item rate = round(perCycle/**1.18**) — GST backed out at HARDCODED 1.18 regardless of gstRate; due today+15; status 'unpaid'; unshift. Detail 'Billed to date' = Σ invoiceTotals.total, 'Collected' = Σ paid over contract invoices — contracts.js:707-709.
- AMC module (delivery.js V.amc): rows mode≠onetime; tabs on contractStatus; sort end ASC; 'Visits today' = amc-category jobs today not cancelled; fold state per id survives tabs; upcoming = contract jobs not completed/cancelled date ASC; owed-but-ungenerated amber banner when plan total > generated — delivery.js:31-207.
- One-time module (delivery.js V.onetime): categoryOf(j) — no contractId → onetime, else contract's mode; unplanned = open AND (!date || !slot || dayDelta<0); tabs upcoming/today/unplanned/done/all; sort (date+slot) ASC; grouped under day headings + 'No date set' — delivery.js:18-25,227-252.
- Roles: contracts/amc/onetime sidebar admin/ops/sales; accounts sees contracts only; contract-new EXTRA admin/ops/sales; canManage detail actions = admin|ops; New buttons on modules = admin|ops — app.js:41-97,152-154; contracts.js:711; delivery.js:74,262.

### 2.12 Jobs / execution
- Services list tabs (jobs.js:35-60): today (date===today), upcoming (dayDelta>0), open (status!=='completed'), unassigned (techIds empty), completed; filters tab AND techFilter AND query over (id+clientName+jobTitle+type); sort (date+slot) ASC, DESC on completed.
- New job modal: customer required; type default One-Time; date default tomorrow; slot from SLOTS default '10:00'; tech optional; priority normal|high; ≥1 service; mins = Σ service.mins||60; status 'scheduled'; visitNo/ofVisits 0; exec null; WA tech if assigned — jobs.js:108-168.
- Assign-modal toggle (jobs.js:817-869): rows show that-day load (jobsOn — includes cancelled), red when >3; click: already on → remove; else if on.length ≥ need → on.shift() (oldest evicted) then push; WA tech only on add. **Direct mutation — no pin, no snap/clamp via placeJob.**
- Reschedule modal: date+slot+reason; direct set (no pin); WA customer; hidden once completed — jobs.js:870-889.
- jobTitle = service names joined ' + ' else j.type — store.js:986-989.
- **Tech step gating** (jobs.js:361-427): 8 steps, st(cond,active) → done|active|locked: (1) travel — done when enroute or checkinAt; (2) checkin after travel; (3) before-photos after checkin; (4) start after ≥1 before photo; (5) chemicals once started (never 'done'); (6) findings once started; (7) after-photos after start; (8) signature+rating after ≥1 after photo. Finish enabled only when hasSign && hasAfter — jobs.js:420-424,736-740.
- Status transitions (only in UI): scheduled→enroute (travel; set again at checkin) → inprogress (start, startedAt) → completed (finish). No cancel UI. Resign clears signature/signedBy/rating without status change — jobs.js:684-707,720,736-777.
- Check-in geo: geolocation {timeout:2400, maximumAge:60000} + own 2500ms race; success 'lat° N, lng° E' 4dp; fallback random '13.0(300-699)° N, 80.2(300-699)° E' — jobs.js:539-552.
- Live timer when inprogress: 1s tick from startedAt; 'mm:ss' → 'hh:mm:ss' ≥1h — jobs.js:554-570.
- Photos: accept image/*, capture environment; shrink ≤520px JPEG q0.72, fallback original on canvas taint; 'Sample' button pushes Seed.photo SVG; removable by index — jobs.js:17-32,460-471,604-651.
- Chemicals: select over inventory cat==='Chemical'; qty default 50 min 1; falsy qty → err toast — jobs.js:473-492,709-717.
- Signature pad: canvas 168px, dpr-scaled, #0F1729 2.2 round; savesig requires ink + non-empty name (prefilled client.contact); rating = tapped stars || 5; captures observations — jobs.js:503-528,572-600,719-733.
- Finish (jobs.js:736-777): guard toast when disabled; finishedAt = nowStamp; durationMins = minutesBetween || 1; status 'completed'; **consumeStock(j.id, exec.chemicals, me.id)**; completion modal → WA report + navigate #/my-work.
- consumeStock (store.js:1394-1407): per chemical item.stock = max(0, stock−qty); unshift stockMove {type:'Consumed', ref:jobId, qty:−qty, by}.
- Report card: timing stats (ts.slice(-5)); GPS line; photo grids + lightbox; findings badges green when text starts 'No activity' else amber; chemicals table joined to inventory; signature block or 'Not signed'; stars + feedback quote — jobs.js:170-242.
- Detail routing by role: tech → techDetail (narrow, back #/my-work); others → managerDetail (back #/jobs) — jobs.js:781-789. canManage = admin|ops|sales — jobs.js:243-346.
- Schedule month grid: 42 cells from Sunday of week containing the 1st; trailing all-out-of-month weeks (index ≥4) dropped; count badge only when >2 jobs; first 3 pills + '+N more'; own TONE hexes per status — schedule.js:21-66.
- Schedule day: 14-day strip (−3..+10) with dots; per-tech kanban (no branch filter); WORKLOAD colored danger >420 min, warn >300; trailing dashed 'Unassigned' column — schedule.js:72-127.

### 2.13 Invoices & payments
- List tabs: open = status!=='paid'; overdue; paid; all. Search id+clientName+period. Header = 'Σ all balances across N open invoices'. Record-payment + reminders buttons: admin, accounts only — invoices.js:20-36.
- Days late = −dayDelta(due); row shows '<n> days late' when late>0 && status!=='paid' — invoices.js:59,300.
- recordPayment: amount>0 required, default round(balance); date default today overridable; then syncInvoiceStatus; auto-WA receipt — store.js:1380-1391, invoices.js:96-111.
- Send reminders (list) targets overdue OR unpaid — invoices.js:376-380; accounts-dashboard reminders target overdue only — dashboard.js:392-395.
- Tax-invoice doc: stamp colours {paid:success, overdue:danger, partial:warn, unpaid:info}; **HARDCODED SAC '998531' and Place of supply 'Tamil Nadu (33)'**; contract id + planSummary + billing cycle when contractId; totals = taxable, taxRows, total, (if paid>0) 'Amount paid −X' + 'Balance due'; amountInWords; bank+UPI; footer terms hardcoded '15 days… 18% p.a.… Chennai jurisdiction.' — invoices.js:156-262.
- Receipt doc: Received from / Against invoice / mode / ref / Received by (userName); amount + words; 'computer-generated, no signature' — invoices.js:126-155.

### 2.14 KPIs, reports, dashboards
- **kpis()** (store.js:992-1030): receivable = Σ balance ALL invoices (statuses synced in loop); overdue = Σ balance status 'overdue'; pipeline = Σ value of OPEN_LEAD_STAGES leads; lowStock = stock < min; unassigned = no techIds && dayDelta(date)≥0 && not cancelled; monthRev = Σ invoiceTotals.total where dayDelta(date) ≥ −30 (**rolling 30 days, not calendar month**); avgRating = mean exec.rating; todayOpen = today's jobs − completed today; expiring/active via contractStatus.
- monthlySeries (store.js:1033-1049): last 6 calendar months, key 'YYYY-MM' by string prefix on job.date/invoice.date; per month {total, done, revenue = Σ invoice totals}.
- serviceMix: count serviceIds over completed jobs (job counts once per service), top 6 — store.js:1052-1060.
- **techLeaderboard** (store.js:1062-1078): rating = mean exec.rating of rated completed jobs else u.rating||0; **onTime = 88 + (u.id.charCodeAt(2) % 11) — DELIBERATELY FAKE placeholder** (duplicated team.js:27; reports.js:159 badges green ≥92). v2: compute honestly or drop.
- activityFeed (store.js:1409-1435): merge 8 latest completed jobs (by exec.finishedAt), first 4 quotations (ts date+'T12:00'), 4 payments (+'T11:00'), 4 leads (+'T10:00'); sort desc, slice(limit||12).
- Reports·Business (reports.js:52-99): Billed 6mo = Σ monthlySeries revenue; Contract book = Σ value non-expired contracts; Collected = Σ ALL payments; Outstanding = kpis.receivable. clientValue: billed = Σ invoiceTotals.total, visits = completed jobs, sorted desc; bar = billed/top-client-billed*100; share = round(billed/totalBilled*100)+'%'.
- Reports·Delivery (reports.js:101-150): completion rate = round(done / max(1, jobs with dayDelta(date) ≤ 0) *100); avg time on site = mean durationMins; rating 1dp; chart a=done, b=max(0, total−done); by-type share = count/all*100.
- Reports·Pest (reports.js:13-36,210-231): pestTrend = count exec.findings excluding 'No activity…', key = text before '—' trimmed; chemUse = Σ chemicals qty per item, cost = item.cost*qty, sorted cost desc + total row; attention sites = per client latest completed job, 'Watch' red badge when bad findings ≥ 2.
- Dashboard·admin: greeting by time of day; attention card = up to 2 each of unassigned jobs / expiring AMCs / low-stock / overdue invoices — dashboard.js:24-56,119-155.
- Dashboard·sales: win rate = round(won/(won+lost)*100) or 0 — dashboard.js:230; open quotes = status 'sent' + Σ quoteTotals; pipeline bars count/maxC*100.
- Dashboard·accounts: sync all statuses first; Collected 30d = Σ payments dayDelta(p.date) ≥ −30; ageing buckets on late = −dayDelta(due): ≤0 'Not due yet' #2E90FA; ≤30 '1–30 days' #F79009; ≤60 '31–60 days' #F04438; else '60+ days' #B42318 — dashboard.js:293-368.

### 2.15 Customers, team, catalogue, branches, lists
- Customer stats (clients.js:15-29): billed = Σ invoiceTotals.total; due = Σ balances; visits = completed jobs; live contracts = not expired; card badge 'AMC' if any live else 'One-time'.
- Customer save: display name (fallback company), mobile (fallback work), gstTreatment all REQUIRED (failure jumps to Other-details tab, focuses select) — clients.js:416-428.
- Legacy defaults on edit: missing gstTreatment guessed — gstin → 'Registered Business - Regular'; type 'Residential' → 'Consumer'; else 'Unregistered Business'; billing.street1 from flat addr — clients.js:292-298.
- Customer delete (clients.js:508-601): reference counts {contracts, jobs, invoices, quotations, leads, portal users}; none → plain confirm; else cascade modal deleting jobs+contracts+quotations+invoices AND their payments AND audits whose jobId belonged AND stockMoves whose ref was a deleted job; **leads + portal users KEPT with clientId cleared**.
- Team save (team.js:269-328): name+phone; ≥1 branch; aadhaar 12 digits if given; ≥1 emergency contact with name+phone; designation auto-defaults per role while unedited.
- branchStaff = users role!=='client' with branchId ∈ branches — store.js:131-135.
- Catalogue edit rights admin+ops; delete blocked when referenced by jobs/contracts/quotations(items.svId)/leads(interest) with counts toast; unreferenced delete → confirm, removes pdf — services.js:19-70.
- Service save: name required; code default slice(0,3).toUpperCase(); price parseFloat||0; mins parseInt||60; checklist = newline split trimmed; pdf must be application/pdf mime or .pdf name — services.js:218-236.
- Branch save: name+code required; code unique case-insensitive excl. self; areas comma-split deduped; delete BLOCKED while branchStaff>0 (no cascade; 'records keep the tag') — masterdata.js:65-116.
- Master lists: add rejects case-insensitive dup; remove blocked when length ≤ 1 — masterdata.js:196-219.

### 2.16 Inventory
- stockPct = min(100, round(stock / max(1, min*2) * 100)); bar red stock<min, amber stock<min*1.4 — inventory.js:12-17.
- expiryState: dayDelta<0 'Expired' red; <90 '<d> days left' amber; else date grey — inventory.js:18-24.
- Stock value = Σ stock*cost; 'Consumed this month' = moves qty<0 && dayDelta(date) ≥ −30.
- Adjust: IN default qty 1000, ref = PO, optional batch/expiry update, type 'Purchase' +; OUT default 100, must ≤ stock, ref = tech userId, type 'Issued' −; by = me().id||'U02' — inventory.js:26-66.

### 2.17 Audits
- Score (audits.js:11-22): scored = items with v pass|fail (**na EXCLUDED from score**); pct = round(pass/scored*100), 0 when nothing scored; done = items with any v (na counts toward completion).
- Grade: ≥90 Excellent green; ≥75 Satisfactory blue; ≥60 Needs improvement amber; else Critical red — audits.js:23-28.
- Lifecycle: created draft with template items {t,v:'',r:''}; toggle pass/fail/na, clicking active value CLEARS it; per-item + overall remarks autosave on input; Complete requires ALL items answered; completed = read-only, shareable via WA with score — audits.js:70-199.
- List stats: avg score = mean pct of completed; open non-conformities = Σ fail counts of completed — audits.js:210-215.

### 2.18 Shell, routing, roles
- NAV per role (app.js:28-122): admin=[dashboard, masterdata, services, clients, leads, quotations, contracts, amc, onetime, schedule, team, inventory, audits, invoices, reports, settings]; ops=[dashboard, masterdata, services, clients, contracts, amc, onetime, schedule, team('Technicians'), audits, inventory]; sales=[dashboard, services, clients, leads, quotations, contracts, amc, onetime]; accounts=[dashboard, invoices, quotations, contracts, clients, reports]; tech=[my-work, my-schedule, my-history, my-stock, profile]; client=[portal, portal-contracts, portal-visits, portal-invoices, portal-request].
- EXTRA per role (app.js:151-158): admin=[profile, approve, pdf, jobs, contract-new, board]; ops=+[invoices, reports]; sales=[profile, jobs, approve, pdf, schedule, contract-new, board]; accounts=[profile, approve, pdf]; tech=[jobs, approve, pdf]; client=[profile, approve, pdf]. allowed = NAV ∪ EXTRA; forbidden hash silently rewrites to DEFAULT_ROUTE — app.js:160-165,318-320.
- DEFAULT_ROUTE: admin/ops/sales/accounts→dashboard; tech→my-work; client→portal — app.js:147-148.
- Sidebar badges from kpis: leads=openLeads; contracts=expiring (hot); amc=todayOpen; inventory=lowStock (hot) — app.js:39-75.
- Mobile TABS (app.js:124-131): admin=[dashboard, clients, amc, onetime, __more]; ops=[dashboard, amc, onetime, schedule, __more]; sales=[dashboard, clients, leads, quotations, __more]; accounts=[dashboard, invoices, contracts, clients, __more]; tech=[my-work, my-schedule, my-history, profile]; client=[portal, portal-contracts, portal-visits, portal-invoices]. Count dot caps '9+'. Short-label map app.js:257-261.
- Router: hash '#/name/id'; id + V[name+'Detail'] → detail view (auditsDetail, clientsDetail, contractsDetail, invoicesDetail, jobsDetail, quotationsDetail, teamDetail); ctx = {id, me, role, go, refresh}; whole <main> node replaced per route; view.narrow adds .page-narrow — app.js:312-352.
- BARE mode: routes ['approve','pdf'] strip all chrome — app.js:327-328,362-364. TITLES map → topbar h1 + document.title '· PestOps' — app.js:133-145,357-360.
- Boot deep links: ?as=<userId> signs in that user; ?role=<key> first user of role; guest fallback (no session AND (?q= OR #/approve|#/pdf)) → first client-role user; no session → index.html — app.js:176-192.
- Login: role order [admin, ops, sales, tech, accounts, client]; tech card opens technician picker ('N services today · done'); enter() → 'app.html?as='+userId + role start route — index.html:101-167.
- Reset semantics: reset(demo) — setup collections always kept/reseeded; work arrays seeded only when demo truthy. userMenu/index 'Reset demo data' call S.reset() (no arg → setup only); Settings 'Load the sample business' = reset(true); 'Clear everything' = reset(false) — app.js:401, settings.js:329,338, store.js:59-63.
- Global search (app.js:448-495): '/' key opens (when not in an input); debounce 130ms; substring over clients (name+contact+phone+id), jobs (id+clientName+jobTitle), quotations (id+title), contracts (id+clientName), invoices (id+clientName), leads (id+name+phone → list, no detail); results permission-filtered by allowed(role); cap 12.
- QUICK create by role (app.js:271-289): admin=[client, lead, quote, job, contract, member]; ops=[job, contract, member]; sales=[client, lead, quote]; accounts=[payment, quote]; client=[request]; tech=[] (hidden). Desktop-only.
- Notifications: '<n> new' badge; unread tinted; Mark all read → unread=false all + toast — app.js:416-445.
- Toasts: tones ok|err|wa; optional sub + action {label,run}; action toasts 6000ms, plain 3200ms — ui.js:55-78.
- Modal: scrim/[data-close]/Escape close (dismissable:false blocks scrim); body scroll locked; onClose on EVERY close path; autofocus first input >720px width — ui.js:83-122. U.confirm danger tone → btn-danger — ui.js:124-144.
- WhatsApp: DEFAULT_CC '91'; waLink 'https://wa.me/<digits>?text='; waAppLink 'whatsapp://send?...'; openWhatsapp validates then openTab (anchor-click anti-popup-block, window.open fallback, final err toast); **U.whatsapp() = demo simulated send toast** — ui.js:285-370.
- Permission matrix in Settings = derived live from NAV over 14 modules + 2 synthetic rows (Technician app = tech only, Customer portal = client only); read-only — settings.js:69-104.
- Settings→Company: [data-co]/[data-bank]/[data-term] inputs; gstRate parseFloat fallback 18; single 'save-co' button persists both company + tax cards — settings.js:302-316.
- Settings→Notifications channel toggles (4) + Automation rules (5) are STATIC demo checkboxes, not persisted — settings.js:152-181. v2: make real.
- WA template editor: var chips insert {var} at cursor; per-template Save persists body + on; Preview fills hardcoded sample data in WhatsApp-green bubble — settings.js:251-296.
- Icon set: icons.js ico(name, cls, size), viewBox 24, stroke 1.8; unknown → 'help'. (Full name list in extraction; port needed only if v2 mirrors iconography.)

### 2.19 Customer portal
- myClient = user.clientId — portal.js:9. Overview rating = mean completed exec.rating 1dp; next visit = first non-completed job dayDelta≥0 asc; outstanding banner when Σ balances > 0 (statuses synced first); 'Protected under AMC' when any contract not expired; findings badge green on 'No activity' — portal.js:44,121-141,313.
- Service request creates real job: {id nextId JOB- pad4, type Complaint|One-Time|Callback|Inspection, contractId null, clientId, serviceIds [one], date (default D(2)), slot (6 fixed), mins svc.mins||60, techIds [], status scheduled, priority 'high' if Complaint else 'normal', visitNo/ofVisits 0, notes 'Raised by customer through the portal. '+text, exec null} + ops notification {icon userplus, tone blue, 'Service request — <client>'} — portal.js:427-446.
- Portal 'reschedule'/'renew'/'wa'/pay/download actions are simulated toasts only — portal.js:475-478.

### 2.20 Seed demo-day rules (port only if v2 ships a demo)
- AMC jobs materialized only within −210..+190 days of today — data.js:692-694; past visits get deterministic fabricated exec blocks — data.js:720-742; forced 'today board' per tech — data.js:756-826; unassigned queue incl. 4-person termite job — data.js:828-864; 46 deterministic historical one-offs — data.js:872-910; historical paid invoices payment = round(rate*1.18) — data.js:1024-1046; liveTime/liveSlot clamp in-progress timer into working hours — data.js:40-50; seed visit duration SLOT_MINS=90 — data.js:670.

---

## 3. SCREEN INVENTORY (port tracker)

### Shell & auth
- [ ] Login / role picker (index.html) — 6 role cards, tech picker modal, demo footer + Reset
- [ ] App shell (app.html) — sidebar + nav badges, mobile drawer, topbar, bottom tabbar, user menu (My profile / Switch role / Reset demo data / Sign out), BARE variant
- [ ] Global search modal ('/' shortcut, 12 permission-filtered hits)
- [ ] Notifications dropdown + Mark all read
- [ ] Quick-create dropdown (role-scoped)
- [ ] Settings — Company tab (profile, tax & billing, document numbering readonly, T&C editor)
- [ ] Settings — Roles & access tab (6 role cards + derived permission matrix)
- [ ] Settings — Notifications tab (WA template editor w/ preview bubble, static channel + automation toggles)
- [ ] Settings — Demo & data tab (counts, workflow checklist, load-sample / clear-all, build info)
- [ ] My Profile (#/profile)

### Sales
- [ ] Leads (#/leads) — pipeline kanban (7 columns, SOP-only moves, column totals) + list mode + search
- [ ] Lead detail modal (xl two-page) — SOP card + inline panels, quotations section, AMC section, customer kv, activity timeline, owner/branch panel, next-step banner, earlier leads
- [ ] Capture new lead modal — phone auto-match, area→branch datalist, services checklist
- [ ] Quotations list (#/quotations) — tabs, search, valid-till coloring, Templates stub
- [ ] Quotation builder modal (xl) — 'Raise for' combobox, mode toggle, party panels, line items + visits strips, live totals, terms, signature section
- [ ] Quotation detail (#/quotations/:id) — action row, approved banner, full docHtml A4 document
- [ ] WhatsApp share modal — number validation, merged-PDF attachment card, message textarea, portable PDF link + approve link, Open chat / Desktop app / Share with files
- [ ] Customer approve page (#/approve/:id, BARE, guest) — decided/expired/hello states, sheets list, doc, accept/decline
- [ ] Bare PDF page (#/pdf/:id, BARE, ?d= capable) — iframe preview, download, open-in-tab

### Contracts
- [ ] Contracts list (#/contracts) — stats, tabs, search, table, chooser entry
- [ ] Contract detail (#/contracts/:id) — banners, stats, service plan table, visit schedule, side KV/scope/billing history
- [ ] Plan editor modal (editPlan) — editable grid, merge/Sundays toggles, live preview + diff banner + warnings, apply
- [ ] Assign technicians modal — per-line chips, on-trip sorting, peak-vs-sum hint, oldest-pick eviction
- [ ] New contract chooser modal (AMC vs One-time; skipped for moded quotes)
- [ ] Unified contract form (#/contract-new) — header card, address panels, services + totals, terms & signatures, AMC schedule card with date chips + shared-trip marks, summary panel
- [ ] Renew confirm dialog
- [ ] AMC module (#/amc) — collapsible contract cards with visit schedule, owed-but-ungenerated banner
- [ ] One-time module (#/onetime) — day-grouped rows, 'Needs a date' tab

### Operations
- [ ] Dispatch board (#/board) — full board: queue panel, branch groups, zoom/fit, week strip, filter chips, stats, lanes with gaps/off-hours/now-line, run sheets, legend, print
- [ ] Board bar popover (nudge/resize/suggest/unpin/unassign/open)
- [ ] Suggest modal (ranked techs + why chips)
- [ ] Drag tooltip (live dropCheck warnings / unassign hint / resize duration)
- [ ] Schedule month view (#/schedule) — 42-cell grid, pills, selected-day list
- [ ] Schedule day list — 14-day strip, per-tech kanban + unassigned column
- [ ] Services list (#/jobs) — tabs, search, tech filter, Remind customers batch
- [ ] New service modal
- [ ] Manager job detail (#/jobs/:id) — stats, banners, customer/assignment cards, service kv, report card
- [ ] Assign technician modal (toggle w/ crew cap)
- [ ] Reschedule modal
- [ ] Technician job detail — 8 gated step cards, live timer, sticky finish bar
- [ ] Completion modal ('Nice work…')
- [ ] Completed technician view (green banner + report)
- [ ] Report card (shared) — timings, GPS, photos + lightbox, findings, chemicals, observations, signature, rating, WA + print
- [ ] Tech home screens: #/my-work, #/my-schedule, #/my-history, #/my-stock (tech NAV routes)

### Money & master data
- [ ] Invoices list (#/invoices) — tabs, search, days-late column
- [ ] Record payment modal
- [ ] Quick-pay picker
- [ ] Receipt document modal
- [ ] Invoice detail (#/invoices/:id) — banners, payment history, printable tax-invoice doc
- [ ] Reports (#/reports) — Business / Service delivery / Technicians / Pest & chemical tabs; Print + Export CSV stub
- [ ] Dashboard (#/dashboard) — 4 role variants (admin / ops / sales / accounts)
- [ ] Customers list (#/clients) — card grid with stats + inline actions
- [ ] Customer editor modal (xl) — type radios, tabbed Other details / Address / Contact persons / Documents / Remarks
- [ ] Customer detail (#/clients/:id) — stats, tabs Overview / Contracts / Visit history / Invoices
- [ ] Customer delete flows (plain confirm + cascade modal)
- [ ] Team list (#/team) — branch chips, tech cards, all-members table
- [ ] Team member editor (lg) — photo/signature uploads, identity, employment, branches, emergency, documents
- [ ] Team member detail (#/team/:id) — record kv, access chips, tech schedule/history
- [ ] Service catalogue (#/services) — category chips, cards
- [ ] Service detail modal
- [ ] Service editor modal (incl. PDF sheet upload)
- [ ] Master Data (#/masterdata) — Branches tab + Lead sources + Property types simple lists
- [ ] Branch editor modal
- [ ] Inventory (#/inventory) — stats, low-stock banner, tabs incl. Stock movements
- [ ] Stock adjust modal (purchase / issue)
- [ ] Add inventory item modal
- [ ] Audits list (#/audits) — stats, cards with score rings
- [ ] New audit modal (template preview)
- [ ] Audit detail (#/audits/:id) — checklist toggles, remarks autosave, complete gate, share

### Customer portal (all narrow)
- [ ] Portal Overview (#/portal) — hero, next visit, outstanding banner, contracts, reports, provider kv
- [ ] Portal My Contracts (#/portal-contracts) — visit schedule tables, renewal footer
- [ ] Portal Service History (#/portal-visits) — upcoming + completed cards, report modal
- [ ] Portal Invoices (#/portal-invoices) — stats, invoice modal w/ tax rows + pay stub
- [ ] Portal Request Service (#/portal-request) — type/service/date/slot form, success modal

---

## 4. API SURFACE (merged, deduplicated)

### Auth & shell
- POST /auth/session — {userId} (demo) or credentials → {user, token}; DELETE /auth/session
- GET /me — current user; drives NAV/TABS/EXTRA/QUICK gating (enforce allowed() server-side on every route)
- GET /shell/counters — kpis slice for badges {openLeads, expiring, todayOpen, lowStock, unassigned, receivable, overdue, monthRev, avgRating}
- GET /search?q= — ≤12 permission-filtered hits [{type, id, title, sub, href}]
- GET /notifications; POST /notifications/mark-all-read
- GET /kpis — dashboard aggregate; GET /dashboard?role= — role-shaped payload (attention feed, activity feed, ageing buckets, sales extras)
- POST /admin/demo/load | /admin/demo/clear | /admin/demo/reset — reset(true/false/()) equivalents; sequences become DB sequences with v1 prefixes/padding

### Settings
- GET/PUT /settings/company (+ PUT /settings/company/terms) — gstRate drives all tax math
- GET /settings/numbering — next QT-/INV- numbers (read-only in v1)
- GET /settings/wa-templates; PUT /settings/wa-templates/:k {body, on}; POST /settings/wa-templates/:k/preview — fillTemplate semantics (unknown tokens literal)
- GET /settings/permissions — derived matrix, read-only
- GET /settings/terms — default T&C list (5-item fallback floor)

### Directory & branches
- GET /directory?q= / GET /directory/lookup?phone=&name= — phoneKey last-10 lookup over clients-then-deduped-leads; GET /directory/:phoneKey/history — prior leads
- GET /branches — cards w/ staff/lead counts; GET /branches/resolve?area= (= branchForArea 3-pass, active only)
- POST /branches | PUT /branches/:id — code unique; DELETE /branches/:id — 409 while staff posted
- GET/POST/DELETE /master-lists/{leadSources|propertyTypes} — dup rejected, delete blocked at 1 remaining
- GET /master/lead-sources | /master/property-types | /master/states
- GET /users?assignable=true (sales/ops/admin ranked); GET /users?roles=tech,ops

### Leads
- GET /leads?stage=&q=&owner=&branch= — with computed dueState + stage metadata
- POST /leads — mints LD-id, computes value from catalogue, stage new|followup, seeds log
- GET /leads/:id — lead + quotations (totals) + leadContracts (4-way match) + contactHistory + log
- PATCH /leads/:id — assignment writes log entry on change
- POST /leads/:id/transition — {action: interested|no_answer|not_interested|quote_accepted|contract_signed, date?, time?, techId?, reason?} — enforces one-step ladder, clears opposite commitment, appends log

### Quotations
- GET /quotations?status=&q= — totals + daysToExpiry + {countsByStatus, sentValue}
- POST /quotations — full builder payload; QT-id typed-if-unique; months=max(item.months) amc; flips lead to 'quoted'
- GET /quotations/:id — + party snapshot, totals, taxRows, amountInWords
- PATCH /quotations/:id — 409 when contractId set
- POST /quotations/:id/duplicate — new draft, today, +15d
- POST /quotations/:id/status — {approved|rejected} — cascades lead stage (contract-unless-won / lost)
- POST /quotations/:id/send — {phone, message} — validates 11-15 digits, markSent, returns {waLink, waAppLink, pdfUrl, approveUrl}
- GET /quotations/:id/pdf — merged A4 PDF (quote + service sheets); filename '<id>-<party-slug>.pdf'
- POST /quotations/:id/share-token — signed public token URLs embedding a frozen snapshot (replaces ?d= packing; must show what-was-sent after edits)
- POST /quotations/:id/convert (alias /quotes/:id/convert) — quote→contract: promote lead→client (phoneKey dedupe), draft/sent → approved + lead 'contract' (not won), returns contract-form prefill / creates contract per flow
- GET /wa-templates/quote_sent; POST /wa-templates/quote_sent/preview — {quoteId} → filled body (fix or preserve {customer} quirk)

### Public / guest
- GET /public/quotes/:token (or /:id?token=) — approve-page payload, no auth
- POST /public/quotes/:token/decision — {decision, note?} — status + decidedAt, decline note appended, lead contract/lost + 'from the shared link' log; idempotent once decided
- GET /public/quotes/:token/pdf; GET /public/quotes/:token/sheets/:serviceId

### Contracts & plans
- GET /contracts?type=&status=&q=&sort= — computed {status, progress, staffing, planSummary, nextVisitDate, value}
- GET /contracts/everything — contracts + standalone jobs in one-time shape (everything() parity)
- GET /contracts/:id — + plan, progress, staffing rows, peak crew, linked quote/lead, {billed, collected}
- POST /contracts — unified-form draft; validates (subject, ≥1 line, slotEnd>slot, AMC ≥28d); computes totals/value/crew; id-vs-seq; generates visits or single job; closes quote; marks lead won + log; returns {contract, visitsCreated}
- GET /contracts/next-number?mode=
- POST /contracts/plan/preview — unsaved-contract preview: {visits, perLineDates, sharedDates, serviceVisits, mergedCount, totalMins, peakCrew, warnings}
- GET/POST /contracts/:id/plan/preview — planVisits output without writing
- POST /contracts/:id/plan/diff — {add, update, remove, kept, frozen, warnings} without writing
- PUT /contracts/:id/plan (apply) — respects frozen, renumbers visitNo/ofVisits, past dates created completed; returns counts + droppedTechs
- GET /contracts/:id/plan — plan lines + per-line staffing
- PUT /contracts/:id/assignments — {lines:[{svId, techIds[]}]} — cap at crew, clear legacy techId, syncCrew; returns {visitsUpdated, heldPinned, staffing}
- POST /contracts/:id/sync-crew — {updated, held}
- GET /contracts/:id/assignment-context — techs w/ open-job counts, current crews, trip-mate map, peakCrew
- GET /contracts/:id/crew — {peakCrew, staffing, understaffed}
- GET /contracts/:id/visits — schedule rows
- POST /contracts/:id/renew — copy starting at old end, new AMC- id, quoteId null, generates visits
- POST /contracts/:id/invoices — {label?} — perCycle invoice, rate = round(perCycle/1.18), due +15d

### Dispatch & scheduling
- GET /dispatch/board?date=&branchId= — branch groups → techs (workHours, load, freeGaps ≥45), day's non-cancelled jobs, queue, summary
- GET /dispatch/week?date= — 7 entries {date, jobCount, unassignedCount}
- GET /dispatch/drop-check?jobId=&techId=&date=&startMin= — [{level:block|warn, text}]; advisory only
- GET /dispatch/suggest?jobId=&date=&limit=6 — ranked rows per scoring
- POST /dispatch/auto-assign — {date} → {placed, skipped}
- POST /dispatch/balance — {date} → {moved}
- POST /dispatch/undo — {entries:[{jobId, before}]} batch restore
- GET /techs/:id/gaps?date=&buffer=20; GET /techs/:id/first-free?date=&mins=&notBefore=
- GET /dispatch/run-sheets?date=&branchId= — ordered stops + hop minutes (print view)
- GET /schedule/month?month= — jobs grouped by day (include cancelled, per jobsOn); GET /schedule/day?date= — per-tech columns + unassigned

### Jobs & execution
- GET /jobs?tab=&techId=&q=&category=onetime — list + per-tab counts; sort (date+slot) asc, desc for completed; one-time category server-side
- POST /jobs — creates job (mins = Σ service.mins, scheduled, visitNo/ofVisits 0, exec null); tech notification when assigned
- GET /jobs/:id — full job + client + contract summary + assigned users + exec
- PATCH /jobs/:id — {mins?, pinned?, priority?, notes?, date?, slot?} (resize sets mins+pinned; unpin; reschedule WITHOUT pin)
- POST /jobs/:id/place — {techIds?, date, startMin} — snap 15, dedupe+clamp crew, pinned=true; returns {job, before}
- POST /jobs/:id/unassign — techIds=[], pinned=false; returns {job, before}
- POST /jobs/:id/restore — {before} exact undo
- POST /jobs/:id/assign-toggle — {techId} — remove-if-present / evict-oldest-at-capacity then append; NO pin; notify only on add
- POST /jobs/:id/reschedule — {date, slot, reason} — no pin; customer notification
- POST /jobs/:id/exec/travel | /checkin {geo?} | /start — status enroute / stamp checkinAt / inprogress+startedAt
- POST /jobs/:id/exec/photos (multipart kind before|after; resize ≤520px q0.72); DELETE …/photos?kind=&index=
- POST /jobs/:id/exec/chemicals {itemId, qty>0}; DELETE …/chemicals/:index — stock NOT touched until finish
- PUT /jobs/:id/exec/findings — {findings[], observations}
- POST /jobs/:id/exec/signature — {signedBy*, signatureImage?, rating default 5, inked}; DELETE = resign
- POST /jobs/:id/exec/finish — requires ≥1 after photo AND signature; finishedAt, durationMins=max(1,…), completed; atomically decrements stock (floor 0) + 'Consumed' stockMoves
- POST /jobs/:id/consume-stock — {chemicals:[{itemId,qty}]} (internal alias of finish consumption)
- GET /findings-catalog — 10 canonical strings

### Tax & billing
- GET /tax/quote/:id/totals; GET /tax/invoice/:id/totals — {sub, disc?, taxable?, gst, cgst, sgst, igst, interState, place, rate, half, total, paid?, balance?} — single source for taxSplit/quoteTotals/invoiceTotals
- GET /invoices?status=&q= — computed totals, derived status, daysLate, per-tab counts, receivable sum
- GET /invoices/:id — full document payload (items, client, contract, totals, taxRows, words, payments)
- POST /invoices/:id/payments — {amount>0, mode, ref?, date?} — rounds, receivedBy from auth, re-derives status (admin/accounts)
- GET /payments?since=&invoiceId=; GET /payments/:id/receipt
- POST /invoices/reminders — overdue+unpaid (list) or overdue-only (accounts dashboard)

### Reports
- GET /reports/business — {billed6m, contractBook, collected, outstanding, overdue, revenueByMonth[6], customerValue[]}
- GET /reports/delivery — {visitsDelivered, completionRatePct, avgOnSiteMins, avgRating, monthly[], serviceMixTop6, byType[]}
- GET /reports/technicians — leaderboard (define real on-time or drop the fake)
- GET /reports/pests — {pestTrend, chemicalUse + totalCost, attentionSites}
- GET /reports/monthly-series | /reports/service-mix | /reports/tech-leaderboard — chart feeds

### Customers
- GET /clients?q= — card rows + {visitsDone, billed, due, hasLiveAmc}
- POST /clients | PUT /clients/:id — full payload; validates displayName+mobile+gstTreatment
- GET /clients/:id — + stats + tab data
- DELETE /clients/:id?cascade= — 409-style reference counts unless cascade; cascade removes jobs/contracts/quotes/invoices/payments/audits/stockMoves, unlinks leads + portal users
- POST /clients/:id/documents | DELETE …/documents/:docId — per-file size limit

### Team
- GET /team?branchId= — members + tech perf + unposted count
- POST /team | PUT /team/:id — validation (name, phone, ≥1 branch, aadhaar 12, ≥1 emergency); add hours editor in v2
- POST /team/:id/photo | /signature | /documents — resize 320/520/900; PUT /users/:id/signature — the on-file sign consumed by doc rendering
- GET /team/:id — full record + emergency + docs + tech schedule/history + access list

### Catalogue
- GET /services?cat=&q= — + usage counts; GET /services/:id
- POST /services | PUT /services/:id (admin/ops)
- POST /services/:id/sheet (PDF ≤1.5MB) | DELETE | GET — auto-attached to quotations
- DELETE /services/:id — 409 with usage summary when referenced

### Inventory
- GET /inventory?cat=&q= — + stockPct, lowStock, expiryState, value + summary {stockValue, lowCount, expiring90d, consumed30d}
- POST /inventory — new item
- POST /inventory/:id/moves — {kind: purchase|issue, qty>0 (issue ≤ stock), ref|techId, batch?, expiry?}
- GET /stock-moves — ledger with joins

### Audits
- GET /audits?status= — cards + score + grade + summary
- GET /audit-templates — the 3 checklists (v2: editable master data)
- POST /audits — {type, clientId, date, auditorId} — copies template, auto-links first contract, draft
- PATCH /audits/:id — item answers + remarks (autosave, draft only)
- POST /audits/:id/complete — 422 unless all answered; locks; returns score+grade

### Portal
- GET /portal/overview — {client, contracts+progress, nextVisit, outstanding, paidToDate, metrics}
- GET /portal/contracts — visit schedule rows
- GET /portal/visits (+ /portal/visits/:jobId/report, /report.pdf)
- GET /portal/invoices (+ /:id.pdf); POST /portal/invoices/:id/pay — gateway (v1 simulated)
- POST /portal/requests — {type, serviceId, date, slot, note} → job + ops notification → {jobId}
- POST /portal/actions/reschedule; POST /portal/contracts/:id/renew — v1 toast-only, v2 record the request
- POST /uploads/images — server-side downscale ≤520px JPEG q0.72 (replaces shrinkImage + 5MB budget)

---

## 5. EXPLICIT NON-GOALS / DEFERRED / PORT DECISIONS

1. **DEAD: V.contracts.newContract legacy modal** (contracts.js:341-612) — exported, no caller (list's [data-new] goes to V['contract-new'].choose). Its one-time quirks (serviceIds slice(0,2), mins 90, shared:false) die with it. Drop or keep behind parity flag.
2. **DEAD: store.js quoteToContract** (store.js:1306-1361) — defined+exported, no view calls it; superseded by amcform applyQuote/create. Keep the /convert endpoint semantics from amcform.
3. **FAKE stat: tech onTime = 88 + (id.charCodeAt(2) % 11)** (store.js:1074, team.js:27) — compute honestly in v2 or drop the column.
4. **'expired' quote status** exists only as display metadata (store.js:394); nothing assigns it — expiry stays computed from `valid`.
5. **'Visits scheduled' stat on contracts list always renders 0** (contracts.js:106-107) — sums a field rows don't carry. Fix or faithfully port.
6. **{customer} vs 'client' template-var mismatch** (data.js:1070) — decide fix vs preserve; note in seed body.
7. **q.terms never printed** — docHtml/quotePdf print co.terms (quotations.js:710,992). Decide: honor per-quote terms in v2 or keep company terms.
8. **Hardcoded on invoice doc**: SAC '998531', Place of supply 'Tamil Nadu (33)', footer terms, GST back-out at /1.18 regardless of gstRate — make configurable.
9. **Stubs / demo shims**: quotations 'Templates' button, reports 'Export CSV', inventory 'Raise purchase order', all U.whatsapp sends (toast only), portal pay/download/reschedule/renew toasts, Settings channel + automation toggles (static). v2 needs real implementations or explicit stubs.
10. **Signature strokes not persisted** on job exec (boolean only) — v2 may store the image; quote/contract signatures DO store PNG dataURLs.
11. **Renewal off-by-one**: UI says 'day after this one ends', code starts SAME day (addMonths(c.end, 0)) — pick one.
12. **ID generation weaknesses** (client/user/service length-based, stockMove random) — v2 uses DB sequences everywhere, keeping v1 prefixes and padding.
13. **jobsOn includes cancelled** — schedule views and assign-modal load counts show cancelled jobs; board filters them itself. Decide per-surface.
14. **user.hours has no editor UI** in v1 — v2 should add one to the member form.
15. **Notification `at` is a freeform relative string** — v2 stores timestamps and formats client-side.
16. **Seed demo-day fabrication rules** (§2.20) — port only if v2 ships a demo tenant.
17. **localStorage-specific machinery** (DB_VER gate, 5MB cap, migrate(), ?as=/?q= session bootstrapping from file://) — replaced by real auth/DB; keep the *behaviors* (guest quote links via signed tokens, per-file upload limits, role deep links for demo).
18. **onLeave blob revoke on the PDF page is defensive** — the v1 router never supplies onLeave (quotations.js:1290-1346).
