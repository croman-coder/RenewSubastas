import { describe, expect, it } from 'vitest';
import { consentFlagScript } from './cookie-consent';

function runWith(cookie: string): Record<string, string> {
  const dataset: Record<string, string> = {};
  const fakeDocument = { cookie, documentElement: { dataset } };
  new Function('document', consentFlagScript())(fakeDocument);
  return dataset;
}

describe('consentFlagScript', () => {
  it('flags the page when the visitor already accepted', () => {
    expect(runWith('a=1; renew_cookie_consent=accepted').cookieConsent).toBe('1');
  });

  it('flags the page when the visitor already rejected', () => {
    expect(runWith('renew_cookie_consent=rejected; b=2').cookieConsent).toBe('1');
  });

  it('leaves the banner visible when no choice was made', () => {
    expect(runWith('a=1').cookieConsent).toBeUndefined();
  });

  it('ignores a value it does not recognise', () => {
    expect(runWith('renew_cookie_consent=maybe').cookieConsent).toBeUndefined();
  });

  it('is not fooled by a cookie whose name merely ends the same way', () => {
    expect(runWith('xrenew_cookie_consent=accepted').cookieConsent).toBeUndefined();
  });
});
