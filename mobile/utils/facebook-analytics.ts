import * as Facebook from 'expo-facebook';

class FacebookAnalytics {
  private initialized = false;

  /**
   * Initialize Facebook SDK
   * Call this once when your app starts
   */
  async initialize() {
    try {
      await Facebook.initializeAsync({
        appId: "1039739124895991",
        appName: "Acadia Learning",
      });
      this.initialized = true;
      console.log("Facebook SDK initialized");
    } catch (error) {
      console.error("Error initializing Facebook SDK:", error);
    }
  }

  /**
   * Log a page view
   * @param screenName - Name of the screen/page being viewed
   */
  async logPageView(screenName: string) {
    if (!this.initialized) {
      return;
    }

    try {
      await Facebook.logEventAsync("fb_mobile_content_view", {
        fb_content_id: screenName,
        fb_content_type: "screen",
      });
    } catch (error) {
      console.error(`Error logging Facebook page view ${screenName}:`, error);
    }
  }

  /**
   * Log when a user starts a free trial
   * @param packageId - The package/plan identifier
   * @param price - The price of the subscription after trial
   * @param currency - The currency code (default USD)
   */
  async logTrialStart(packageId: string, price?: number, currency: string = "USD") {
    if (!this.initialized) {
      return;
    }

    try {
      await Facebook.logEventAsync("StartTrial", {
        fb_content_id: packageId,
        fb_currency: currency,
        ...(price !== undefined && { fb_predicted_ltv: price }),
      });
      console.log("Facebook trial start event logged");
    } catch (error) {
      console.error("Error logging Facebook trial start:", error);
    }
  }
}

// Export singleton instance
export const facebookAnalytics = new FacebookAnalytics();
