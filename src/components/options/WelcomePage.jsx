import { Button, Card, Chip, Link } from '@heroui/react';
import {
  IconApi,
  IconArrowRight,
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
  IconUserPlus
} from '@tabler/icons-react';
import { motion } from 'motion/react';

export function WelcomePage() {
  const handleGetStarted = () => {
    window.location.hash = 'favicon';
  };

  const actionFeatures = [
    { icon: IconClipboard, label: 'Copy IDs instantly' },
    { icon: IconUserPlus, label: 'Share objects with yourself' },
    { icon: IconEye, label: 'Analyze dependencies and relationships' },
    {
      icon: IconFileDescription,
      label: 'Instantly view the activity log for any object'
    }
  ];

  const automaticFeatures = [
    {
      icon: IconBrowser,
      id: 'tab-titles',
      label:
        'Tab titles are set automatically (gone are the days of hundreds of tabs named "Domo")'
    },
    {
      icon: IconFavicon,
      id: 'favicons',
      label: (
        <span>
          Favicons automatically set to the instance logo{' '}
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
        </span>
      )
    },
    {
      icon: IconBolt,
      id: 'context',
      label:
        'Context is dynamic, so you only see what you need when you need it'
    },
    {
      icon: IconCookieOff,
      id: 'cookies',
      label: (
        <span>
          Cookies clear automatically on 431 errors, preserving the last 2
          instances{' '}
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
        </span>
      )
    }
  ];

  const quickStartGuide = [
    <span className='flex flex-row items-end justify-start gap-1'>
      Pin the extension (click{' '}
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
      next to the extension icon)
    </span>,
    'Navigate to an object in Domo',
    <span className='flex flex-row items-end justify-start gap-1'>
      Click the extension icon to use the popup (then click{' '}
      <IconLayoutSidebarRightExpand
        className='inline-block shrink-0 align-middle'
        size={18}
        stroke={1.5}
      />{' '}
      to use the side panel instead if preferred)
    </span>,
    'Use the icon-only action buttons to copy, share, audit, delete, and more (tooltip text available on hover)',
    'Try navigating to different objects and observe the various available action buttons',
    <span className='flex flex-row items-end justify-start gap-1'>
      Adjust your settings and set your favicon preferences (click{' '}
      <IconSettings
        className='inline-block shrink-0 align-middle'
        size={18}
        stroke={1.5}
      />
      )
    </span>,
    'Advanced: Click the Current Context card to access the JSON definition for the current object'
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
      url: 'https://www.postman.com/domoapis/domo-product-apis'
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
          src='/toolkit-128.png'
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
                  <Card.Description className='flex flex-row items-center justify-start gap-2 text-foreground'>
                    <feature.icon
                      className='shrink-0 text-accent'
                      size={18}
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
                  <Card.Description className='flex flex-row items-center justify-start gap-2 text-foreground'>
                    <feature.icon
                      className='shrink-0 text-accent'
                      size={18}
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
        <div className='flex flex-row flex-wrap items-center justify-evenly'>
          {links.map((link) => (
            <Link
              className='no-underline'
              href={link.url}
              key={link.label}
              target='_blank'
            >
              <Button variant='tertiary'>
                <link.icon stroke={1.5} />
                {link.label}
              </Button>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        animate={{ opacity: 1 }}
        className='mt-auto pb-4'
        initial={{ opacity: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <Button fullWidth variant='primary' onPress={handleGetStarted}>
          Get Started
          <IconArrowRight />
        </Button>
      </motion.div>
    </div>
  );
}
