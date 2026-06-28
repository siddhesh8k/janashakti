import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getShareLinks,
  POST_CONFIRMATION_THRESHOLD,
  shouldAutoPost,
} from '../../../src/utils/social';

describe('social utilities', () => {
  const MOCK_ORIGIN = 'http://localhost:3000';

  beforeEach(() => {
    // Mock window.location.origin as it's used in getShareLinks
    vi.stubGlobal('window', {
      location: {
        origin: MOCK_ORIGIN,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getShareLinks', () => {
    const mockIssue = {
      id: 'issue123',
      locationText: 'Downtown Plaza',
      issueType: 'Pothole',
      confirmations: 7,
    };
    const mockXPostUrl = 'https://twitter.com/user/status/1234567890';

    it('should generate correct share links for a valid issue and xPostUrl', () => {
      const links = getShareLinks(mockIssue, mockXPostUrl);

      expect(links.retweet).toBe(`https://twitter.com/intent/retweet?tweet_id=1234567890`);
      expect(links.xShare).toBe(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          `I reported this civic issue in Downtown Plaza. Help get it fixed! ${MOCK_ORIGIN}/issue/issue123 #JanaShakti`
        )}`
      );
      expect(links.whatsapp).toBe(
        `https://wa.me/?text=${encodeURIComponent(
          `Civic issue reported near you!\nPothole at Downtown Plaza\n7 people confirmed.\nTrack it: ${MOCK_ORIGIN}/issue/issue123`
        )}`
      );
      expect(links.linkedin).toBe(
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          `${MOCK_ORIGIN}/issue/issue123`
        )}`
      );
      expect(links.facebook).toBe(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          `${MOCK_ORIGIN}/issue/issue123`
        )}`
      );
      expect(links.telegram).toBe(
        `https://t.me/share/url?url=${encodeURIComponent(
          `${MOCK_ORIGIN}/issue/issue123`
        )}&text=${encodeURIComponent(
          `Pothole at Downtown Plaza — help get it fixed! #JanaShakti`
        )}`
      );
    });

    it('should handle missing or empty locationText in issue object gracefully', () => {
      const issueWithoutLocation = { ...mockIssue, locationText: '' };
      const links = getShareLinks(issueWithoutLocation, mockXPostUrl);

      expect(links.xShare).toContain(encodeURIComponent('in my city'));
      expect(links.whatsapp).toContain(encodeURIComponent('at Unknown'));
      expect(links.telegram).toContain(encodeURIComponent('at my city'));

      const issueNullLocation = { ...mockIssue, locationText: null };
      const linksNullLocation = getShareLinks(issueNullLocation, mockXPostUrl);
      expect(linksNullLocation.xShare).toContain(encodeURIComponent('in my city'));
      expect(linksNullLocation.whatsapp).toContain(encodeURIComponent('at Unknown'));
      expect(linksNullLocation.telegram).toContain(encodeURIComponent('at my city'));
    });

    it('should handle null, undefined, or empty xPostUrl for retweet link', () => {
      const linksNull = getShareLinks(mockIssue, null);
      expect(linksNull.retweet).toBe(`https://twitter.com/intent/retweet?tweet_id=`);

      const linksUndefined = getShareLinks(mockIssue, undefined);
      expect(linksUndefined.retweet).toBe(`https://twitter.com/intent/retweet?tweet_id=`);

      const linksEmpty = getShareLinks(mockIssue, '');
      expect(linksEmpty.retweet).toBe(`https://twitter.com/intent/retweet?tweet_id=`);
    });

    it('should handle zero, null, or undefined confirmations in issue object for whatsapp link', () => {
      const issueZeroConfirmations = { ...mockIssue, confirmations: 0 };
      const linksZero = getShareLinks(issueZeroConfirmations, mockXPostUrl);
      expect(linksZero.whatsapp).toContain(encodeURIComponent('0 people confirmed.'));

      const issueNullConfirmations = { ...mockIssue, confirmations: null };
      const linksNull = getShareLinks(issueNullConfirmations, mockXPostUrl);
      expect(linksNull.whatsapp).toContain(encodeURIComponent('0 people confirmed.'));

      const issueUndefinedConfirmations = { ...mockIssue, confirmations: undefined };
      const linksUndefined = getShareLinks(issueUndefinedConfirmations, mockXPostUrl);
      expect(linksUndefined.whatsapp).toContain(encodeURIComponent('0 people confirmed.'));
    });

    it('should generate links even with minimal issue data (only id and issueType)', () => {
      const minimalIssue = { id: 'minIssue', issueType: 'Test Issue' };
      const links = getShareLinks(minimalIssue, null); // Test with null xPostUrl

      expect(links.retweet).toBe(`https://twitter.com/intent/retweet?tweet_id=`);
      expect(links.xShare).toContain(encodeURIComponent('in my city'));
      expect(links.xShare).toContain(encodeURIComponent(`${MOCK_ORIGIN}/issue/minIssue`));
      expect(links.whatsapp).toContain(encodeURIComponent('at Unknown'));
      expect(links.whatsapp).toContain(encodeURIComponent('0 people confirmed.'));
      expect(links.whatsapp).toContain(encodeURIComponent(`${MOCK_ORIGIN}/issue/minIssue`));
      expect(links.linkedin).toContain(encodeURIComponent(`${MOCK_ORIGIN}/issue/minIssue`));
      expect(links.facebook).toContain(encodeURIComponent(`${MOCK_ORIGIN}/issue/minIssue`));
      expect(links.telegram).toContain(encodeURIComponent('at my city'));
      expect(links.telegram).toContain(encodeURIComponent(`${MOCK_ORIGIN}/issue/minIssue`));
    });
  });

  describe('POST_CONFIRMATION_THRESHOLD', () => {
    it('should have the correct value', () => {
      expect(POST_CONFIRMATION_THRESHOLD).toBe(5);
    });
  });

  describe('shouldAutoPost', () => {
    it('should return false if socialConsent is "none"', () => {
      const issue = { socialConsent: 'none', confirmations: 10 };
      expect(shouldAutoPost(issue)).toBe(false);
    });

    it('should return true if socialConsent is not "none" and confirmations meet the threshold', () => {
      const issue = { socialConsent: 'allowed', confirmations: POST_CONFIRMATION_THRESHOLD };
      expect(shouldAutoPost(issue)).toBe(true);
    });

    it('should return true if socialConsent is not "none" and confirmations exceed the threshold', () => {
      const issue = { socialConsent: 'allowed', confirmations: POST_CONFIRMATION_THRESHOLD + 1 };
      expect(shouldAutoPost(issue)).toBe(true);
    });

    it('should return false if socialConsent is not "none" and confirmations are below the threshold', () => {
      const issue = { socialConsent: 'allowed', confirmations: POST_CONFIRMATION_THRESHOLD - 1 };
      expect(shouldAutoPost(issue)).toBe(false);
    });

    it('should return false if confirmations are null, undefined, or zero and socialConsent is not "none"', () => {
      const issueNullConfirmations = { socialConsent: 'allowed', confirmations: null };
      expect(shouldAutoPost(issueNullConfirmations)).toBe(false);

      const issueUndefinedConfirmations = { socialConsent: 'allowed', confirmations: undefined };
      expect(shouldAutoPost(issueUndefinedConfirmations)).toBe(false);

      const issueZeroConfirmations = { socialConsent: 'allowed', confirmations: 0 };
      expect(shouldAutoPost(issueZeroConfirmations)).toBe(false);
    });

    it('should return true if socialConsent is missing (not "none") and confirmations meet threshold', () => {
      // If socialConsent is missing, it's not strictly equal to 'none', so the first condition passes.
      const issue = { confirmations: POST_CONFIRMATION_THRESHOLD };
      expect(shouldAutoPost(issue)).toBe(true);
    });
  });
});