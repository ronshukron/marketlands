import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingSpinner from '../LoadingSpinner';
import { getCampaignLink } from '../../services/campaignService';
import { trackFunnelStep } from '../../services/funnelService';
import { normalizeCampaignCode, rememberCampaign, safeCampaignTarget } from '../../utils/campaignAttribution';

// /q/{code}: where a flyer's QR code points. Credits this visitor to the
// campaign (30 days, last scan wins), records the scan, and opens the page the
// admin chose for the link. An unknown or closed link just opens the home page.

export default function CampaignRedirect() {
  const { code } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const normalized = normalizeCampaignCode(code);
    (async () => {
      let target = '/';
      try {
        const link = normalized ? await getCampaignLink(normalized) : null;
        if (link && link.active !== false) {
          rememberCampaign(normalized);
          trackFunnelStep('campaign', 'scan', { campaign: normalized, dedupeKey: normalized });
          target = safeCampaignTarget(link.target);
        }
      } catch (error) {
        // An unreadable link still lands the visitor on the site.
      }
      if (active) navigate(target, { replace: true });
    })();
    return () => { active = false; };
  }, [code, navigate]);

  return <div className="py-12"><LoadingSpinner /></div>;
}
