---
name: Apple Review IAP Submission Flow
description: How to correctly submit auto-renewable subscriptions with an app binary in App Store Connect — the exact sequence that works.
---

# Apple Review IAP Submission Flow

## The working sequence (4-item submission)

Apple changed the IAP submission UI — you can no longer add subscriptions directly from the app version page. The correct flow:

1. Go to each individual subscription product (Monthly, Annual) → click **Add for Review** → when the Draft Submission error dialog appears, **close it** (don't try to submit from there — closing keeps the product queued)
2. Go to the iOS App Version page → click **Update Review**
3. The Draft Submission dialog launched FROM the version page will show all 4 items: iOS App, Pro Subscription Group, Monthly, Annual
4. Submit from there

**Why:** "Add for Review" queues products in the background. The Draft Submission dialog accessed from the Subscriptions section lacks a linked app version (hence the error), but the one launched from the version page has it automatically.

## EULA requirement for auto-renewable subscriptions

Apple's automated pre-review check rejects submissions that offer subscriptions without a Terms of Use link. Two things required:
1. In **App Information → License Agreement**: select **Apple's Standard EULA** (not custom)
2. In the **App Description**: add `Terms of Use: https://your-terms-url` at the end

Both together clear the automated check reliably.

**Why:** Using custom EULA requires full legal text and country selection. Apple's standard EULA is recognized instantly by the automated checker.

## First-time submission rule

The FIRST time a subscription group is submitted, it must go with a new app version (cannot be submitted standalone). This is enforced by Apple — the standalone Draft Submission dialog will show "Unable to Submit for Review" until the app version is linked.

## RevenueCat Missing Metadata

"Missing Metadata" in RevenueCat means it can't fetch product info from Apple because no App Store Connect API key is configured. This does NOT block purchases on real devices (StoreKit fetches directly from Apple), but it means RevenueCat can't sync prices. Fix: RevenueCat dashboard → iOS app → App Settings → App Store Connect API → add key.
