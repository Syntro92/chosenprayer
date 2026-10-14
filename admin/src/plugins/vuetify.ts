import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import { icons } from './mdi-icon'; // Import icons from separate file
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { PurpleTheme } from '@/theme/LightTheme';

export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases: {
      ...aliases,
      ...icons
    },
    sets: {
      mdi
    }
  },
  theme: {
    defaultTheme: 'PurpleTheme',
    themes: {
      PurpleTheme
    }
  },
  defaults: {
    VBtn: {},
    VCard: {
      rounded: 'md'
    },
    // Every form field: square corners, outlined, regular height.
    VTextField: { variant: 'outlined', rounded: '0', density: 'comfortable' },
    VTextarea: { variant: 'outlined', rounded: '0', density: 'comfortable' },
    VSelect: { variant: 'outlined', rounded: '0', density: 'comfortable' },
    VAutocomplete: { variant: 'outlined', rounded: '0', density: 'comfortable' },
    VCombobox: { variant: 'outlined', rounded: '0', density: 'comfortable' },
    VTooltip: {
      // set v-tooltip default location to top
      location: 'top'
    }
  }
});
