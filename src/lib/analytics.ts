/**
 * Privacy-conscious analytics abstraction.
 * Never send names, emails, messages, chat content, or payment details.
 */

export type FunnelEvent =
  | 'hero_cta_selected'
  | 'package_finder_started'
  | 'package_finder_completed'
  | 'package_recommended'
  | 'pricing_card_viewed'
  | 'pricing_card_selected'
  | 'checkout_drawer_opened'
  | 'checkout_started'
  | 'checkout_completed_verified'
  | 'contact_form_submitted'
  | 'chat_opened'
  | 'human_handoff_requested';

export interface AnalyticsPayload {
  event: FunnelEvent;
  props?: Record<string, string | number | boolean | undefined>;
}

declare global {
  interface Window {
    __cxTrack?: (payload: AnalyticsPayload) => void;
  }
}

export function track(event: FunnelEvent, props?: AnalyticsPayload['props']): void {
  if (typeof window === 'undefined') return;
  try {
    window.__cxTrack?.({ event, props });
    // Cloudflare Web Analytics custom events (when beacon present)
    const beacon = (window as unknown as { __cfBeacon?: unknown }).__cfBeacon;
    if (beacon && 'send' in (window as object)) {
      // no-op placeholder — CF WA primarily uses automatic page views
    }
    document.dispatchEvent(
      new CustomEvent('cx:analytics', { detail: { event, props } }),
    );
  } catch {
    // never break UX for analytics
  }
}

export const analyticsBootstrap = `
window.__cxTrack = function (payload) {
  try {
    if (!payload || !payload.event) return;
    var detail = { event: payload.event, props: payload.props || {} };
    document.dispatchEvent(new CustomEvent('cx:analytics', { detail: detail }));
  } catch (e) {}
};
`;
