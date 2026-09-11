import { getColorRules } from '@/services/datasets';
import IconColor from '@icons/color.svg?react';
import IconDuplicate from '@icons/duplicate.svg?react';
import IconPersonPlus from '@icons/person-plus.svg?react';

// Button-facing half of the duplicator registry, kept out of `registry.js` so
// the popup can size the Duplicate button without bundling every duplicator's
// views and services. Each implementation spreads its own option from here.
export const DUPLICATOR_DESCRIPTORS = {
  DATA_SOURCE: {
    buttonIcon: IconDuplicate,
    buttonLabel: 'Duplicate',
    buttonTooltip: "Copy part of this dataset's configuration onto another dataset",
    options: [
      {
        icon: IconColor,
        key: 'colorRules',
        label: 'Copy Color Rules',
        preCheck: async (currentContext) => {
          const rules = await getColorRules(currentContext.domoObject.id, currentContext.tabId);
          return rules.length === 0
            ? { empty: true, message: 'This dataset has no color rules to copy.', title: 'No Color Rules' }
            : null;
        },
        tooltip: "Copy this dataset's color rules to another dataset"
      }
    ]
  },
  USER: {
    buttonIcon: IconPersonPlus,
    buttonLabel: 'Duplicate User',
    buttonTooltip:
      'Clone this user into a new user, or add their groups and individually-shared content to an existing user',
    options: [
      {
        icon: IconPersonPlus,
        key: 'user',
        label: 'Duplicate User',
        tooltip: 'Clone this user into a new user, or add their groups and individually-shared content to an existing user'
      }
    ]
  }
};
