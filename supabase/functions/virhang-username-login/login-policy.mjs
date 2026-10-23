// Server-only policy validation. Missing configuration defaults to strict production.
export function acceptsLoginPolicy(configuredEnvironment, policy) {
 const expected = configuredEnvironment || 'production';
 return ['staging', 'production'].includes(expected)
  && policy?.environment === expected
  && policy.limiter_integrity === true
  && policy.privileged_accounts_limited === true
  && typeof policy.developer_bypass === 'boolean'
  && (expected !== 'production' || policy.developer_bypass === false);
}
