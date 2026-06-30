import Constants from "expo-constants";
import { Platform } from "react-native";

type GoogleMobileAdsModule = typeof import("react-native-google-mobile-ads");

const AD_LOAD_TIMEOUT_MS = 20000;

let adsModulePromise: Promise<GoogleMobileAdsModule | null> | null = null;
let initializePromise: Promise<void> | null = null;

function canUseNativeAds() {
  return (
    (Platform.OS === "android" || Platform.OS === "ios") &&
    Constants.appOwnership !== "expo"
  );
}

async function loadAdsModule() {
  if (!canUseNativeAds()) {
    return null;
  }

  if (!adsModulePromise) {
    adsModulePromise = import("react-native-google-mobile-ads").catch(
      (error) => {
        console.warn("[Ads] Google Mobile Ads SDK is unavailable:", error);
        return null;
      }
    );
  }

  return adsModulePromise;
}

function getRewardedAdUnitId(ads: GoogleMobileAdsModule) {
  if (__DEV__) {
    return ads.TestIds.REWARDED;
  }

  const configuredAdUnitId = Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_UNIT_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS_UNIT_ID,
    default: undefined,
  });

  return configuredAdUnitId?.trim() || ads.TestIds.REWARDED;
}

export async function initializeAds() {
  const ads = await loadAdsModule();

  if (!ads) {
    return false;
  }

  if (!initializePromise) {
    initializePromise = ads
      .default()
      .initialize()
      .then(() => undefined)
      .catch((error) => {
        initializePromise = null;
        console.warn("[Ads] Failed to initialize Google Mobile Ads:", error);
        throw error;
      });
  }

  await initializePromise;
  return true;
}

export async function showRewardedScanAd() {
  const ads = await loadAdsModule();

  if (!ads) {
    return false;
  }

  await initializeAds();

  const rewardedAd = ads.RewardedAd.createForAdRequest(
    getRewardedAdUnitId(ads),
    {
      requestNonPersonalizedAdsOnly: true,
      keywords: ["restaurant", "inventory", "food"],
    }
  );

  return new Promise<boolean>((resolve) => {
    let hasEarnedReward = false;
    let hasSettled = false;
    const unsubscribeListeners: Array<() => void> = [];

    const settle = (result: boolean) => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      clearTimeout(timeoutId);
      unsubscribeListeners.forEach((unsubscribe) => unsubscribe());
      rewardedAd.removeAllListeners();
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      settle(false);
    }, AD_LOAD_TIMEOUT_MS);

    unsubscribeListeners.push(
      rewardedAd.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
        rewardedAd.show().catch(() => settle(false));
      }),
      rewardedAd.addAdEventListener(
        ads.RewardedAdEventType.EARNED_REWARD,
        () => {
          hasEarnedReward = true;
        }
      ),
      rewardedAd.addAdEventListener(ads.AdEventType.CLOSED, () => {
        settle(hasEarnedReward);
      }),
      rewardedAd.addAdEventListener(ads.AdEventType.ERROR, () => {
        settle(false);
      })
    );

    rewardedAd.load();
  });
}
