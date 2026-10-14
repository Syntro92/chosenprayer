// Shared look-and-feel values for the Overview cards. All numbers come from /api/admin/*.

export const palette = {
  yellow: '#FFBE00',
  success: '#7E9B83',
  warning: '#D99A24',
  error: '#C85C5C',
  border: '#E2E6E3',
  textPrimary: '#171918',
  textSecondary: '#66706D'
};

export const statusStyle: Record<string, { bg: string; fg: string }> = {
  succeeded: { bg: '#7E9B8326', fg: '#5f7d65' },
  pending: { bg: '#D99A2426', fg: '#A6761A' },
  failed: { bg: '#C85C5C26', fg: '#C85C5C' },
  refunded: { bg: '#66706D1f', fg: '#66706D' },
  canceled: { bg: '#66706D1f', fg: '#66706D' }
};
