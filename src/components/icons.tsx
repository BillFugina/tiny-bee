import type { ReactNode, SVGProps } from 'react'

/** A few line icons, drawn inline so the app needs no icon package. All are decorative. */
function Icon({ children, size = 18, ...props }: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

type Props = SVGProps<SVGSVGElement> & { size?: number }

export const SunIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Icon>
)

export const MoonIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Icon>
)

export const ArrowRightIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Icon>
)

export const ArrowLeftIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Icon>
)

export const MapPinIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
)

export const UsersIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
)

export const SparklesIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" />
  </Icon>
)

export const CheckSquareIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m9 11 3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </Icon>
)

export const BotIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
  </Icon>
)

export const PlusIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M5 12h14M12 5v14" />
  </Icon>
)

/** The Tiny Bee mark from the Honey designs: three stacked layers. */
export const LogoIcon = (p: Props) => (
  <Icon strokeWidth={2.5} {...p}>
    <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </Icon>
)

export const UserIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
)

export const LogOutIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Icon>
)

export const ArrowUpIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m5 12 7-7 7 7M12 19V5" />
  </Icon>
)

export const ArrowDownIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Icon>
)

export const ArrowUpRightIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M7 7h10v10M7 17 17 7" />
  </Icon>
)

export const XIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
)

export const CheckIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)

export const CheckCircleIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
)

export const CalendarIcon = (p: Props) => (
  <Icon {...p}>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
)

export const ClockIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Icon>
)

export const CarIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2M9 17h6" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </Icon>
)

export const CompassIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m16.24 7.76-1.8 5.41a2 2 0 0 1-1.27 1.27l-5.41 1.8 1.8-5.41a2 2 0 0 1 1.27-1.27z" />
  </Icon>
)

export const TrophyIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </Icon>
)

export const CrownIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.67a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.67a1 1 0 0 0 1.52-.3zM5 21h14" />
  </Icon>
)

export const InfoIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Icon>
)

export const VoteIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m9 12 2 2 4-4M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7ZM22 19H2" />
  </Icon>
)

export const ShareIcon = (p: Props) => (
  <Icon {...p}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
  </Icon>
)

export const NavigationIcon = (p: Props) => (
  <Icon {...p}>
    <path d="M3 11 22 2l-9 19-2-8-8-2Z" />
  </Icon>
)

export const ChevronDownIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const ChevronLeftIcon = (p: Props) => (
  <Icon {...p}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
)
