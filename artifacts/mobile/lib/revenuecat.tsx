import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/expo";
import { syncSubscription } from "@workspace/api-client-react";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// Comma-separated list of Clerk user IDs that always have Pro access (app owners/admins)
const ADMIN_USER_IDS = new Set(
  (process.env.EXPO_PUBLIC_ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);
// Comma-separated list of email addresses that always have Pro access.
// More robust than user IDs — works across Clerk test and production instances.
const ADMIN_EMAILS = new Set(
  (process.env.EXPO_PUBLIC_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

function getRevenueCatApiKey(): string | null {
  // In dev, Expo Go, web, or storeClient → use test key if available
  if (__DEV__ || Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    return REVENUECAT_TEST_API_KEY || null;
  }

  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY || null;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY || null;

  return REVENUECAT_TEST_API_KEY || null;
}

export function initializeRevenueCat(userId?: string) {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    console.warn("[RevenueCat] No API key available — paywall disabled. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY.");
    return;
  }
  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  if (userId) {
    Purchases.logIn(userId).catch(console.error);
  }
  console.log("[RevenueCat] Configured");
}

function useSubscriptionContext() {
  const { userId } = useAuth();
  const { user } = useUser();
  const primaryEmail = (user?.primaryEmailAddress?.emailAddress ?? "").toLowerCase();

  const isAdmin =
    (!!userId && ADMIN_USER_IDS.has(userId)) ||
    (!!primaryEmail && ADMIN_EMAILS.has(primaryEmail));

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    staleTime: 60_000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    staleTime: 300_000,
  });

  /**
   * Syncs an active RevenueCat entitlement to our server DB.
   * Called after every purchase and restore as a safety net for missed webhooks.
   */
  async function syncEntitlementToServer(customerInfo: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>) {
    const proEntitlement = customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];
    if (!proEntitlement) return; // nothing to sync
    try {
      await syncSubscription({
        entitlementId: REVENUECAT_ENTITLEMENT_IDENTIFIER,
        expiresAt: proEntitlement.expirationDate ?? null,
        isActive: true,
      });
    } catch (err) {
      // Non-fatal: webhook may have already written the record
      console.warn("[RevenueCat] subscription sync failed:", err);
    }
  }

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: any) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: async (customerInfo) => {
      await syncEntitlementToServer(customerInfo);
      customerInfoQuery.refetch();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => Purchases.restorePurchases(),
    onSuccess: async (customerInfo) => {
      await syncEntitlementToServer(customerInfo);
      customerInfoQuery.refetch();
    },
  });

  const rcSubscribed =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  // Admins always have Pro access regardless of RevenueCat status
  const isSubscribed = isAdmin || rcSubscribed;

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isAdmin,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
