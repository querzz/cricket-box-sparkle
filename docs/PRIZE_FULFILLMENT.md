# CRICKET BOX — Prize Fulfillment

## MVP: manual fulfillment

All non-instant prizes are created as a `PENDING` payout when the user wins them. Admins process the payout from `/admin/payouts`:

```text
PENDING → REVIEW → PAID
                  ↘ FAILED
                  ↘ CANCELLED
```

For `PAID`, the operator must enter a fulfillment reference such as a transaction hash, marketplace order ID, delivery code, tracking ID, or another durable confirmation. The operator identity, provider (`MANUAL` for normal prizes), reference and optional note are stored on the payout and in the audit log.

Stars won from a spin follow the same manual payout lifecycle in the MVP. They are not silently credited to the user's Stars balance as an automatic reward. Stars used for a withdrawal are separate: a failed or cancelled withdrawal is refunded through the append-only Stars ledger, subject to the existing account cap.

## Why this is structured now

The payout record already separates the business lifecycle from the fulfillment mechanism:

- `status` describes whether the reward is pending, under review, completed, failed or cancelled.
- `fulfillment_provider` identifies how the reward was actually delivered.
- `fulfillment_reference` stores the durable external confirmation.
- `fulfillment_note` stores an operator note.
- `fulfillment_metadata` is reserved for provider-specific data later.

This means a future automated provider can replace the manual operator step without changing the spin or payout lifecycle.

## Future automation

When volume justifies it, add provider adapters behind the payout lifecycle. Examples include a Telegram Stars sender, NFT marketplace/wallet provider, digital-code provider, or shipping provider.

The future flow should remain:

```text
PENDING → REVIEW/PROCESSING → PAID
                         ↘ FAILED
```

Provider calls must be idempotent, record an external reference, retry safely, and never create a second payout for the same spin. Manual fallback should remain available when a provider is unavailable or requires human review.

No automated external fulfillment is enabled by this MVP implementation.
