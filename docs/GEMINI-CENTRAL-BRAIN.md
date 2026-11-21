# Gemini Central Business Brain

## Goal
Keep Gemini as the shared reasoning and natural-language layer while Kwik Klin's
Python services remain the authority for persisted facts, calculations, and actions.

## Runtime boundaries
- `app/services/llm_client.py` is the central Gemini provider boundary. Keep model
  selection, bounded retries, circuit breaker, usage attribution, and budget checks there.
- The owner-facing business assistant is the manager-query loop in `bill_agent.py`.
  It chooses tools from `agent_tools.TOOL_SPECS`; each tool runs deterministic
  application code and returns an observation for Gemini to explain.
- Customer and staff workflows keep their separate permissions and narrow schemas.
  They may use the same Gemini provider, but must not inherit owner permissions.
- Python/domain services validate and execute writes. Gemini must never invent live
  orders, balances, rates, staff replies, or cost figures.
- Tool failures must degrade safely; no unsupported “done” claims. Write actions,
  outbound messages, campaigns, task status changes, and financial changes retain
  their existing explicit confirmation, audit, tenant/RLS, and outbound-policy gates.

## Cost calculator limits and safe interpretation
The owner-only `cost_analysis` tool is the read-only costing workbench. Call it before
answering numeric questions about per-garment cost, profit, discount limits, or whether
there is enough history. It can inspect a 30-day or 90-day window of Expense, delivered
Order, and active Rate rows, then report expense-category totals, monthly expense/order
trends, service/garment volume, configured variable costs, rate-card coverage, and missing
data. It uses tenant-scoped application data and Decimal arithmetic.

Treat recorded values as facts, but never infer missing expenses as zero. If the owner asks
for "actual profit" or a final minimum safe price, explain which costs are not yet allocated.
A configured `Rate.cost_rate` is only a variable-cost estimate. Gross contribution is
selling price minus that configured variable cost; it is NOT net profit.

Expense rows do not yet carry a verified allocation basis. Do not divide the full expense
pool by pieces and kilograms at once, and do not call that result an audited garment cost.
To make costing more accurate over 2-3 months, the owner should record all material,
detergent/packaging, electricity/water, labour/payroll, pickup/delivery, machine upkeep,
and outsourced dry-cleaning costs. Where possible, associate costs with service/order,
machine time, staff minutes, garment count, or kilograms processed. The report must show
missing categories and unclassified order lines and recommend better data capture rather
than inventing values. Do not change rates, apply discounts, or send campaigns from this
read-only analysis.


## Verification and rollout
- Run focused tests plus the complete CI suite before merge.
- Do not send WhatsApp messages, mutate production data, or deploy as part of code review.
- After merge, deployment and a production health check remain a separate, explicit step.
