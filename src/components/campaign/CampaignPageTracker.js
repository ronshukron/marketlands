import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackFunnelStep } from '../../services/funnelService';
import { campaignPathLabel, getActiveCampaign } from '../../utils/campaignAttribution';

// For visitors who came from a flyer / QR campaign only: each page they open is
// a "page_view" event (once per page per visit), so the campaigns report can
// show the paths people take. Other visitors write nothing here.

const SKIPPED = ['/q/', '/admin', '/business', '/driver'];

export default function CampaignPageTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (SKIPPED.some((prefix) => pathname.startsWith(prefix))) return;
    if (!getActiveCampaign()) return;
    const path = campaignPathLabel(pathname, search);
    trackFunnelStep('campaign', 'page_view', { path, dedupeKey: path });
  }, [pathname, search]);
  return null;
}
