# Manual fulfillment

For MVP, physical/digital prizes such as NFT, Premium, money, and other custom rewards can be fulfilled manually by the operator. The system records the win and creates a `payout` entry; it does not attempt to move an NFT on-chain or send an external reward automatically.

## Operator flow

1. Open **Админка → Выплаты**.
2. Move `Ожидает` to `На проверке` after checking the winner and prize.
3. Fulfill the prize manually using the appropriate provider/wallet/account.
4. Press `Выдать` and record a **fulfillment reference**: transaction hash, order ID, activation code, delivery ID, or another durable proof. An optional operator note can also be stored.
5. The payout becomes immutable from the normal admin flow: completed statuses cannot be reopened.

Every status change is written to `audit_logs` with the admin actor. The fulfillment reference is retained in the payout note for the MVP so it remains available without introducing a separate fulfillment service.

## Stars

`STARS` prize rewards are credited to the application's Stars balance through the append-only Stars ledger. A user's Stars withdrawal is a separate payout workflow and is still manually fulfilled during MVP. The operator should record the Telegram-side transaction/reference when marking a withdrawal as `PAID`.

The balance remains capped at 500 Stars. Refund/cancellation of a Stars withdrawal returns the amount through the append-only ledger, respecting the same cap.

## Future automation

The payout model is intentionally kept provider-agnostic. Later, an automated fulfillment worker can consume `PENDING/REVIEW` payouts, call the relevant provider for each prize kind, save the provider reference, and move the payout to `PAID`. The manual path remains the fallback for failed providers or exceptional prizes.
