import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProfile, PROFILE_NAMES } from '../complianceProfiles.js';

describe('getProfile()', () => {
  it('returns GDPR profile with both stages enabled', () => {
    const p = getProfile('GDPR');
    expect(p.name).toBe('GDPR');
    expect(p.stage1).toBe(true);
    expect(p.stage2).toBe(true);
    expect(p.comprehendEntityTypes).toContain('NAME');
  });

  it('returns DORA profile with stage1 only', () => {
    const p = getProfile('DORA');
    expect(p.name).toBe('DORA');
    expect(p.stage1).toBe(true);
    expect(p.stage2).toBe(false);
  });

  it('returns PCI_DSS profile with stage1 only', () => {
    const p = getProfile('PCI_DSS');
    expect(p.name).toBe('PCI_DSS');
    expect(p.stage1).toBe(true);
    expect(p.stage2).toBe(false);
  });

  it('returns full profile with both stages enabled', () => {
    const p = getProfile('full');
    expect(p.name).toBe('full');
    expect(p.stage1).toBe(true);
    expect(p.stage2).toBe(true);
  });

  it('falls back to GDPR for unknown profile names', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const p = getProfile('UNKNOWN_PROFILE');
    expect(p.name).toBe('GDPR');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown compliance profile'),
    );
    stderrSpy.mockRestore();
  });

  it('PROFILE_NAMES contains all expected profiles', () => {
    expect(PROFILE_NAMES).toContain('GDPR');
    expect(PROFILE_NAMES).toContain('DORA');
    expect(PROFILE_NAMES).toContain('PCI_DSS');
    expect(PROFILE_NAMES).toContain('full');
  });
});
