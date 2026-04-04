import { Button, Card, Chip, Kbd, Link } from '@heroui/react';
import {
  IconApi,
  IconArrowUpRight,
  IconBolt,
  IconBrowser,
  IconBug,
  IconClipboard,
  IconCookieOff,
  IconEye,
  IconFavicon,
  IconFileDescription,
  IconFileTypeDoc,
  IconLayoutSidebarRightExpand,
  IconPinned,
  IconPuzzle,
  IconSettings,
  IconSparkles,
  IconUserPlus,
  IconX
} from '@tabler/icons-react';
import { motion } from 'motion/react';

export function WelcomePage() {
  const handleClose = () => {
    window.close();
  };

  const actionFeatures = [
    {
      icon: IconFileDescription,
      label: 'Instantly view the activity log for the current object'
    },
    { icon: IconUserPlus, label: 'Share objects with yourself in one click' },
    { icon: IconEye, label: 'Analyze dependencies and relationships' },
    {
      icon: IconClipboard,
      label: (
        <p>
          Copy IDs with a click or keyboard shortcut{' '}
          <Kbd>
            <Kbd.Abbr
              keyValue={
                (
                  navigator.userAgentData?.platform ?? navigator.platform
                ).includes('Mac')
                  ? 'command'
                  : 'ctrl'
              }
            />
            <Kbd.Abbr keyValue='shift' />
            <Kbd.Content>1</Kbd.Content>
          </Kbd>
        </p>
      )
    }
  ];

  const automaticFeatures = [
    {
      icon: IconBrowser,
      id: 'tab-titles',
      label:
        'Tab titles are set to the object name. Say goodbye to identical tabs named "Domo"'
    },
    {
      icon: IconFavicon,
      id: 'favicons',
      label: (
        <p>
          Favicons set to the instance logo{' '}
          <Link
            className='text-sm font-normal no-underline decoration-accent hover:text-accent hover:underline'
            href='#favicon'
          >
            (customizable
            <Link.Icon className='size-3'>
              <IconArrowUpRight />
            </Link.Icon>
            )
          </Link>
        </p>
      )
    },
    {
      icon: IconBolt,
      id: 'context',
      label:
        'Actions and information appears when relevant, and disappears when not'
    },
    {
      icon: IconCookieOff,
      id: 'cookies',
      label: (
        <p>
          431 "request headers too large" errors resolve themselves and your
          current session stays logged in{' '}
          <Link
            className='text-sm font-normal no-underline decoration-accent hover:text-accent hover:underline'
            href='#settings'
          >
            (adjustable
            <Link.Icon className='size-3'>
              <IconArrowUpRight />
            </Link.Icon>
            )
          </Link>
        </p>
      )
    }
  ];

  const quickStartGuide = [
    <p className='flex flex-row items-end justify-start gap-1'>
      Pin the extension: click{' '}
      <IconPuzzle
        className='inline-block shrink-0 align-middle'
        size={18}
        stroke={1.5}
      />{' '}
      in your browser toolbar, then click{' '}
      <IconPinned
        className='inline-block shrink-0 align-middle'
        size={18}
        stroke={1.5}
      />{' '}
      next to the extension icon
    </p>,
    'Navigate to an object in Domo',
    <p>
      Click the extension icon to use the popup (then click{' '}
      <IconLayoutSidebarRightExpand
        className='inline-block shrink-0 align-middle'
        size={18}
        stroke={1.5}
      />{' '}
      to use the side panel instead if preferred)
    </p>,
    'Use the icon-only action buttons to copy, share, audit, navigate, and delete (tooltip text available on hover)',
    'Try navigating to different objects and observe the various available action buttons',
    <p>
      Adjust your settings and set your favicon preferences (click{' '}
      <IconSettings
        className='inline-block shrink-0 align-middle'
        size={18}
        stroke={1.5}
      />
      )
    </p>,
    'Advanced: click the current context card to access the JSON definition for the current object'
  ];

  const links = [
    {
      icon: IconFileTypeDoc,
      label: 'Documentation',
      url: 'https://domotoolkit.com'
    },
    {
      icon: IconEye,
      label: 'Privacy Policy',
      url: 'https://domotoolkit.com/PRIVACY_POLICY'
    },
    {
      icon: IconBug,
      label: 'Report a Bug',
      url: 'https://github.com/brycewc/domo-toolkit/issues/new?template=bug-report.md'
    },
    {
      icon: IconSparkles,
      label: 'Request a Feature',
      url: 'https://github.com/brycewc/domo-toolkit/issues/new?template=feature-request.md'
    },
    {
      icon: IconApi,
      label: 'Postman Collection',
      url: 'https://www.postman.com/brycewc/workspace/domo-product-apis'
    }
  ];

  return (
    <div className='flex h-screen w-full max-w-4xl flex-col justify-between gap-4 px-4 pt-8 pb-4'>
      {/* Header */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className='flex flex-col items-center justify-center gap-4 text-center'
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <img
          alt='Domo Toolkit Logo'
          className='h-16 w-16'
          src='/toolkit-transparent-512.png'
        />
        <h1 className='text-xl font-semibold text-foreground'>
          Welcome to Domo Toolkit
        </h1>
        <p className='text-sm'>
          All the tools you need for working faster in Domo
        </p>
      </motion.div>

      {/* Action Features */}
      <motion.div
        animate={{ opacity: 1 }}
        className='space-y-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          What you can do
        </p>
        <div className='grid grid-cols-2 gap-2'>
          {actionFeatures.map((feature, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className='h-full'
              initial={{ opacity: 0, y: 10 }}
              key={feature.label}
              transition={{ delay: 0.15 + index * 0.05, duration: 0.2 }}
            >
              <Card className='h-full'>
                <Card.Header>
                  <Card.Description className='flex flex-row items-start justify-start gap-2 text-foreground'>
                    <feature.icon
                      className='size-5.5 shrink-0 text-accent'
                      stroke={1.5}
                    />
                    {feature.label}
                  </Card.Description>
                </Card.Header>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Automatic Features */}
      <motion.div
        animate={{ opacity: 1 }}
        className='space-y-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          What happens automatically
        </p>
        <div className='grid grid-cols-2 gap-2'>
          {automaticFeatures.map((feature, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className='h-full'
              initial={{ opacity: 0, y: 10 }}
              key={feature.id}
              transition={{ delay: 0.15 + index * 0.05, duration: 0.2 }}
            >
              <Card className='h-full'>
                <Card.Header>
                  <Card.Description className='flex flex-row items-start justify-start gap-2 text-foreground'>
                    <feature.icon
                      className='size-5.5 shrink-0 text-accent'
                      stroke={1.5}
                    />
                    {feature.label}
                  </Card.Description>
                </Card.Header>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Getting Started */}
      <motion.div
        animate={{ opacity: 1 }}
        className='space-y-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          Quick Start Guide
        </p>
        <Card>
          <Card.Content>
            <ol className='space-y-2 text-sm'>
              {quickStartGuide.map((step, index) => (
                <li className='flex items-center gap-2'>
                  <Chip
                    className='size-6 items-center justify-center rounded-full'
                    color='accent'
                    variant='soft'
                  >
                    {index + 1}
                  </Chip>
                  {step}
                </li>
              ))}
            </ol>
          </Card.Content>
        </Card>
      </motion.div>

      {/* Links */}
      <motion.div
        animate={{ opacity: 1 }}
        className='flex flex-col gap-2'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        <p className='text-sm font-medium tracking-wide uppercase'>
          Helpful Links
        </p>
        <Card>
          <Card.Content className='flex flex-row flex-wrap items-center justify-evenly'>
            {links.map((link) => (
              <Link
                className='no-underline'
                href={link.url}
                key={link.label}
                target='_blank'
              >
                <Button variant='secondary'>
                  <link.icon stroke={1.5} />
                  {link.label}
                </Button>
              </Link>
            ))}
          </Card.Content>
        </Card>
      </motion.div>

      {/* Footer */}
      <motion.div
        animate={{ opacity: 1 }}
        className='mt-auto pb-4'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <Button fullWidth variant='primary' onPress={handleClose}>
          <IconX />
          Close
        </Button>
      </motion.div>
    </div>
  );
}
