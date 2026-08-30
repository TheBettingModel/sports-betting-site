import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { AppState, Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useAuth, useUser } from "@clerk/expo";
import {
  getSubscriptionStatus,
  syncSubscription,
} from "@workspace/api-client-react";
import { completeSubscriptionReconciliation } from "@/utils/subscriptionReconciliation";
import {
  gamesTodayQueryKey,
  subscriptionStatusQueryKey,
} from "@/utils/viewerQueryKeys";
import { createRevenueCatIdentityCoordinator } from "@/utils/revenueCatIdentity";

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
  const { userId, getToken } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const clerkUserIdRef = useRef(userId);
  clerkUserIdRef.current = userId;
  const identityCoordinatorRef = useRef<ReturnType<typeof createRevenueCatIdentityCoordinator> | null>(null);
  if (!identityCoordinatorRef.current) {
    identityCoordinatorRef.current = createRevenueCatIdentityCoordinator({
      getCurrentUserId: () => clerkUserIdRef.current,
      logIn: async (targetUserId) => {
        await Purchases.logIn(targetUserId);
      },
      logOut: async () => {
        await Purchases.logOut();
      },
    });
  }
  const identityCoordinator = identityCoordinatorRef.current;
  const primaryEmail = (user?.primaryEmailAddress?.emailAddress ?? "").toLowerCase();
  const statusQueryKey = useMemo(() => subscriptionStatusQueryKey(userId), [userId]);
  const gamesQueryKey = useMemo(() => gamesTodayQueryKey(userId), [userId]);

  const isAdmin =
    (!!userId && ADMIN_USER_IDS.has(userId)) ||
    (!!primaryEmail && ADMIN_EMAILS.has(primaryEmail));

  const identifyRevenueCatUser = useCallback(async (expectedUserId = userId) => {
    if (!expectedUserId) {
      throw new Error("Please sign in before managing your subscription.");
    }
    await identityCoordinator.identify(expectedUserId);
    return expectedUserId;
  }, [identityCoordinator, userId]);

  const withAuthenticatedRequest = useCallback(async <T,>(
    request: (token: string) => Promise<T>,
  ): Promise<T> => {
    if (!userId) throw new Error("Please sign in before managing your subscription.");

    const run = async (skipCache: boolean) => {
      const token = await getToken({ skipCache });
      if (!token) throw new Error("Your sign-in is still loading. Please try again.");
      return request(token);
    };

    try {
      return await run(false);
    } catch (error) {
      if ((error as { status?: number })?.status !== 401) throw error;
      return run(true);
    }
  }, [getToken, userId]);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info", userId],
    queryFn: async () => {
      const expectedUserId = await identifyRevenueCatUser();
      const customerInfo = await Purchases.getCustomerInfo();
      identityCoordinator.assertCurrent(expectedUserId);
      return customerInfo;
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    staleTime: 300_000,
  });

  const serverStatusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => withAuthenticatedRequest((token) =>
      getSubscriptionStatus({
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ),
    enabled: Boolean(userId),
    staleTime: 0,
  });

  const reconcileEntitlement = useCallback(async (
    customerInfo: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>,
    expectedUserId = userId,
  ) => {
    if (!expectedUserId) {
      throw new Error("Please sign in before managing your subscription.");
    }
    const proEntitlement = customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];
    await identifyRevenueCatUser(expectedUserId);
    identityCoordinator.assertCurrent(expectedUserId);

    const status = await withAuthenticatedRequest(async (token) => {
      identityCoordinator.assertCurrent(expectedUserId);
      const headers = { Authorization: `Bearer ${token}` };
      const result = await completeSubscriptionReconciliation({
        entitlement: proEntitlement
          ? { expirationDate: proEntitlement.expirationDate ?? null }
          : undefined,
        sync: (expiresAt) => syncSubscription({
            entitlementId: REVENUECAT_ENTITLEMENT_IDENTIFIER,
            expiresAt,
            isActive: true,
          }, { headers }),
        getStatus: () => getSubscriptionStatus({ headers }),
        refreshGames: () => queryClient.invalidateQueries({
          queryKey: gamesQueryKey,
          exact: true,
          refetchType: "all",
        }),
      });
      identityCoordinator.assertCurrent(expectedUserId);
      return result;
    });

    identityCoordinator.assertCurrent(expectedUserId);
    queryClient.setQueryData(statusQueryKey, status);
    queryClient.setQueryData(["revenuecat", "customer-info", expectedUserId], customerInfo);
    return status;
  }, [gamesQueryKey, identifyRevenueCatUser, identityCoordinator, queryClient, statusQueryKey, userId, withAuthenticatedRequest]);

  const reconcileCurrentEntitlement = useCallback(async () => {
    const expectedUserId = await identifyRevenueCatUser();
    const customerInfo = await Purchases.getCustomerInfo();
    identityCoordinator.assertCurrent(expectedUserId);
    const isActive =
      customerInfo.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
    queryClient.setQueryData(["revenuecat", "customer-info", expectedUserId], customerInfo);

    if (isActive) {
      await reconcileEntitlement(customerInfo, expectedUserId);
    } else {
      await withAuthenticatedRequest(async (token) => {
        identityCoordinator.assertCurrent(expectedUserId);
        const status = await getSubscriptionStatus({
          headers: { Authorization: `Bearer ${token}` },
        });
        identityCoordinator.assertCurrent(expectedUserId);
        queryClient.setQueryData(statusQueryKey, status);
        return status;
      });
    }
  }, [identifyRevenueCatUser, identityCoordinator, queryClient, reconcileEntitlement, statusQueryKey, withAuthenticatedRequest]);

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: any) => {
      const expectedUserId = await identifyRevenueCatUser();
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      identityCoordinator.assertCurrent(expectedUserId);
      await reconcileEntitlement(customerInfo, expectedUserId);
      return customerInfo;
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const expectedUserId = await identifyRevenueCatUser();
      const customerInfo = await Purchases.restorePurchases();
      identityCoordinator.assertCurrent(expectedUserId);
      await reconcileEntitlement(customerInfo, expectedUserId);
      return customerInfo;
    },
  });

  useEffect(() => {
    if (!userId) {
      void identityCoordinator.reset().catch((error) => {
        console.warn("[RevenueCat] logout reset failed:", error);
      });
      return;
    }
    void reconcileCurrentEntitlement().catch((error) => {
      console.warn("[RevenueCat] startup reconciliation failed:", error);
    });
  }, [identityCoordinator, reconcileCurrentEntitlement, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && userId) {
        void reconcileCurrentEntitlement().catch((error) => {
          console.warn("[RevenueCat] resume reconciliation failed:", error);
        });
      }
    });
    return () => subscription.remove();
  }, [reconcileCurrentEntitlement, userId]);

  useEffect(() => {
    if (serverStatusQuery.data?.isSubscribed === true) {
      void queryClient.invalidateQueries({
        queryKey: gamesQueryKey,
        exact: true,
        refetchType: "all",
      });
    }
  }, [gamesQueryKey, queryClient, serverStatusQuery.data?.isSubscribed]);

  const rcSubscribed =
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  // Admins always have Pro access regardless of RevenueCat status
  const isSubscribed =
    isAdmin || rcSubscribed || serverStatusQuery.data?.isSubscribed === true;

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed,
    isAdmin,
    isLoading:
      customerInfoQuery.isLoading ||
      offeringsQuery.isLoading ||
      serverStatusQuery.isLoading,
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
