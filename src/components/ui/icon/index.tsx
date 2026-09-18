import React from 'react';
import { createIcon } from '@gluestack-ui/core/icon/creator';
import { Path, Rect, Circle, Line, Polyline } from 'react-native-svg';
import { tva, type VariantProps } from '@gluestack-ui/utils/nativewind-utils';
import { styled } from 'nativewind';
import {
  PrimitiveIcon,
  Svg,
  type IPrimitiveIcon,
} from '@gluestack-ui/core/icon/creator';

export const UIIcon = createIcon({
  Root: PrimitiveIcon,
}) as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof PrimitiveIcon> &
    React.RefAttributes<React.ComponentRef<typeof Svg>>
>;

const iconStyle = tva({
  base: 'text-foreground fill-none pointer-events-none',
  variants: {
    size: {
      '2xs': 'h-3 w-3',
      xs: 'h-3.5 w-3.5',
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
      xl: 'h-7 w-7',
    },
  },
});

const StyledUIIcon = styled(UIIcon, { className: 'style' });

type IIconProps = IPrimitiveIcon &
  VariantProps<typeof iconStyle> &
  React.ComponentPropsWithoutRef<typeof UIIcon>;

const Icon = React.forwardRef<React.ComponentRef<typeof UIIcon>, IIconProps>(
  function Icon({ size = 'md', className, ...props }, ref) {
    if (typeof size === 'number') {
      return (
        <StyledUIIcon
          ref={ref}
          {...props}
          className={iconStyle({ class: className })}
          size={size}
        />
      );
    }
    if (
      (props.height !== undefined || props.width !== undefined) &&
      size === undefined
    ) {
      return (
        <StyledUIIcon
          ref={ref}
          {...props}
          className={iconStyle({ class: className })}
        />
      );
    }
    return (
      <StyledUIIcon
        ref={ref}
        {...props}
        className={iconStyle({ size, class: className })}
      />
    );
  }
);

Icon.displayName = 'Icon';
export { Icon };

type ParameterTypes = Omit<Parameters<typeof createIcon>[0], 'Root'>;

const createIconUI = ({ ...props }: ParameterTypes) => {
  const UIIconCreateIcon = createIcon({
    Root: Svg,
    ...props,
  }) as React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<typeof PrimitiveIcon> &
      React.RefAttributes<React.ComponentRef<typeof Svg>>
  >;

  return React.forwardRef<React.ComponentRef<typeof Svg>>(function UIIcon(
    {
      className,
      size,
      ...inComingProps
    }: VariantProps<typeof iconStyle> &
      React.ComponentPropsWithoutRef<typeof UIIconCreateIcon>,
    ref
  ) {
    return (
      <UIIconCreateIcon
        ref={ref}
        {...inComingProps}
        className={iconStyle({ size, class: className })}
      />
    );
  });
};
export { createIconUI as createIcon };

// ─── Curated icons (lucide-style, 24×24, stroke 2) ─────────────────

const HomeIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 22V12H15V22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
HomeIcon.displayName = 'HomeIcon';
export { HomeIcon };

const BarChart3Icon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M3 3V21H21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18 17V9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 17V5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 17V13" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
BarChart3Icon.displayName = 'BarChart3Icon';
export { BarChart3Icon };

const StoreIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M3 9L4.5 4.5H19.5L21 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 9H21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 9V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9 22V17C9 16.4696 9.21071 15.9609 9.58579 15.5858C9.96086 15.2107 10.4696 15 11 15H13C13.5304 15 14.0391 15.2107 14.4142 15.5858C14.7893 15.9609 15 16.4696 15 17V22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
StoreIcon.displayName = 'StoreIcon';
export { StoreIcon };

const PackageIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M11 21.73C11.3122 21.9031 11.6561 22 12 22C12.3439 22 12.6878 21.9031 13 21.73L20 17.73C20.6246 17.3762 21 16.7174 21 16V8C21 7.28263 20.6246 6.62382 20 6.27L13 2.27C12.6878 2.09688 12.3439 2 12 2C11.6561 2 11.3122 2.09688 11 2.27L4 6.27C3.37541 6.62382 3 7.28263 3 8V16C3 16.7174 3.37541 17.3762 4 17.73L11 21.73Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 22V12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.3 7L12 12L20.7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7.5 4.27L12 6.85L16.5 4.27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
PackageIcon.displayName = 'PackageIcon';
export { PackageIcon };

const BanknoteIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Rect x="2" y="6" width="20" height="12" rx="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 12H6.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18 12H18.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
BanknoteIcon.displayName = 'BanknoteIcon';
export { BanknoteIcon };

const ListIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Line x1="8" y1="6" x2="21" y2="6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="8" y1="12" x2="21" y2="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="8" y1="18" x2="21" y2="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 6H3.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 12H3.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 18H3.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
ListIcon.displayName = 'ListIcon';
export { ListIcon };

const UsersIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M16 21V19C16 16.7909 14.2091 15 12 15H6C3.79086 15 2 16.7909 2 19V21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="9" cy="7" r="4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M22 21V19C22 17.1362 20.7252 15.5701 19 15.126" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 3.12602C17.7252 3.57006 19 5.13623 19 7.00002C19 8.86381 17.7252 10.43 16 10.874" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
UsersIcon.displayName = 'UsersIcon';
export { UsersIcon };

const SettingsIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M12.22 2H11.78C11.2496 2 10.7409 2.21071 10.3658 2.58579C9.99072 2.96086 9.78 3.46957 9.78 4V4.18C9.77964 4.53073 9.68706 4.87519 9.51154 5.17884C9.33602 5.48248 9.08374 5.73464 8.78 5.91L8.35 6.16C8.04596 6.33554 7.70108 6.42795 7.35 6.42795C6.99893 6.42795 6.65404 6.33554 6.35 6.16L6.2 6.08C5.74107 5.81526 5.19584 5.74344 4.684 5.88031C4.17217 6.01717 3.73555 6.35154 3.47 6.81L3.25 7.19C2.98526 7.64893 2.91345 8.19416 3.05031 8.706C3.18717 9.21783 3.52154 9.65445 3.98 9.92L4.13 10.02C4.43228 10.1945 4.68362 10.4451 4.85905 10.7468C5.03448 11.0486 5.1279 11.391 5.13 11.74V12.25C5.1314 12.6024 5.03965 12.949 4.86405 13.2545C4.68844 13.5601 4.43521 13.8138 4.13 13.99L3.98 14.08C3.52154 14.3456 3.18717 14.7822 3.05031 15.294C2.91345 15.8058 2.98526 16.3511 3.25 16.81L3.47 17.19C3.73555 17.6485 4.17217 17.9828 4.684 18.1197C5.19584 18.2566 5.74107 18.1847 6.2 17.92L6.35 17.84C6.65404 17.6645 6.99893 17.5721 7.35 17.5721C7.70108 17.5721 8.04596 17.6645 8.35 17.84L8.78 18.09C9.08374 18.2654 9.33602 18.5175 9.51154 18.8212C9.68706 19.1248 9.77964 19.4693 9.78 19.82V20C9.78 20.5304 9.99072 21.0391 10.3658 21.4142C10.7409 21.7893 11.2496 22 11.78 22H12.22C12.7504 22 13.2591 21.7893 13.6342 21.4142C14.0093 21.0391 14.22 20.5304 14.22 20V19.82C14.2204 19.4693 14.3129 19.1248 14.4885 18.8212C14.664 18.5175 14.9163 18.2654 15.22 18.09L15.65 17.84C15.954 17.6645 16.2989 17.5721 16.65 17.5721C17.0011 17.5721 17.346 17.6645 17.65 17.84L17.8 17.92C18.2589 18.1847 18.8042 18.2566 19.316 18.1197C19.8278 17.9828 20.2645 17.6485 20.53 17.19L20.75 16.8C21.0147 16.3411 21.0866 15.7958 20.9497 15.284C20.8128 14.7722 20.4785 14.3356 20.02 14.07L19.87 13.99C19.5648 13.8138 19.3116 13.5601 19.136 13.2545C18.9604 12.949 18.8686 12.6024 18.87 12.25V11.75C18.8686 11.3976 18.9604 11.051 19.136 10.7455C19.3116 10.4399 19.5648 10.1862 19.87 10.01L20.02 9.92C20.4785 9.65445 20.8128 9.21783 20.9497 8.706C21.0866 8.19416 21.0147 7.64893 20.75 7.19L20.53 6.81C20.2645 6.35154 19.8278 6.01717 19.316 5.88031C18.8042 5.74344 18.2589 5.81526 17.8 6.08L17.65 6.16C17.346 6.33554 17.0011 6.42795 16.65 6.42795C16.2989 6.42795 15.954 6.33554 15.65 6.16L15.22 5.91C14.9163 5.73464 14.664 5.48248 14.4885 5.17884C14.3129 4.87519 14.2204 4.53073 14.22 4.18V4C14.22 3.46957 14.0093 2.96086 13.6342 2.58579C13.2591 2.21071 12.7504 2 12.22 2V2Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
SettingsIcon.displayName = 'SettingsIcon';
export { SettingsIcon };

const ClockIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 6V12L16 14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
ClockIcon.displayName = 'ClockIcon';
export { ClockIcon };

const MailIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M20 4H4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V6C22 4.89543 21.1046 4 20 4Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M22 7L13.03 12.7C12.7213 12.8934 12.3643 12.996 12 12.996C11.6357 12.996 11.2787 12.8934 10.97 12.7L2 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
MailIcon.displayName = 'MailIcon';
export { MailIcon };

const ShareIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Circle cx="18" cy="5" r="3" strokeWidth="2" />
      <Circle cx="6" cy="12" r="3" strokeWidth="2" />
      <Circle cx="18" cy="19" r="3" strokeWidth="2" />
      <Line x1="8.6" y1="10.5" x2="15.4" y2="6.5" strokeWidth="2" strokeLinecap="round" />
      <Line x1="8.6" y1="13.5" x2="15.4" y2="17.5" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
});
ShareIcon.displayName = 'ShareIcon';
export { ShareIcon };

const SearchIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 21L16.65 16.65" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
SearchIcon.displayName = 'SearchIcon';
export { SearchIcon };

const LockIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M19 11H5C3.89543 11 3 11.8954 3 13V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V13C21 11.8954 20.1046 11 19 11Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
LockIcon.displayName = 'LockIcon';
export { LockIcon };

const EyeIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
EyeIcon.displayName = 'EyeIcon';
export { EyeIcon };

const EyeOffIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M9.88 9.88C9.58525 10.1546 9.34884 10.4859 9.18487 10.8538C9.02091 11.2218 8.93274 11.6191 8.92563 12.0219C8.91852 12.4247 8.99262 12.8248 9.14351 13.1984C9.29439 13.5719 9.51897 13.9113 9.80384 14.1962C10.0887 14.481 10.4281 14.7056 10.8016 14.8565C11.1752 15.0074 11.5753 15.0815 11.9781 15.0744C12.3809 15.0673 12.7782 14.9791 13.1461 14.8151C13.5141 14.6512 13.8453 14.4147 14.12 14.12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10.73 5.08C11.1513 5.02751 11.5754 5.00079 12 5C19 5 22 12 22 12C21.5529 12.9571 20.9922 13.8569 20.33 14.68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.61 6.61C4.62125 7.96462 3.02987 9.82526 2 12C2 12 5 19 12 19C13.9159 19.0051 15.7908 18.4451 17.39 17.39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M2 2L22 22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
EyeOffIcon.displayName = 'EyeOffIcon';
export { EyeOffIcon };

const InfoIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 16V12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 8H12.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
InfoIcon.displayName = 'InfoIcon';
export { InfoIcon };

const AlertCircleIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 8V12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 16H12.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
AlertCircleIcon.displayName = 'AlertCircleIcon';
export { AlertCircleIcon };

const CheckIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M20 6L9 17L4 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
CheckIcon.displayName = 'CheckIcon';
export { CheckIcon };

const ChevronRightIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M9 18L15 12L9 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
ChevronRightIcon.displayName = 'ChevronRightIcon';
export { ChevronRightIcon };

const LogOutIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="16 17 21 12 16 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="21" y1="12" x2="9" y2="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
LogOutIcon.displayName = 'LogOutIcon';
export { LogOutIcon };

const PlusIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Line x1="12" y1="5" x2="12" y2="19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
PlusIcon.displayName = 'PlusIcon';
export { PlusIcon };

const MinusIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
MinusIcon.displayName = 'MinusIcon';
export { MinusIcon };

const WifiOffIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8.5 16.5C10.4 14.6 13.6 14.6 15.5 16.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 12.55C8.8 8.75 15.2 8.75 19 12.55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M1.42 9C7.5 2.94 16.5 2.94 22.58 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 20H12.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
WifiOffIcon.displayName = 'WifiOffIcon';
export { WifiOffIcon };

const UserIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M20 21V19C20 16.7909 18.2091 15 16 15H8C5.79086 15 4 16.7909 4 19V21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="7" r="4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
UserIcon.displayName = 'UserIcon';
export { UserIcon };

const CloseIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Line x1="18" y1="6" x2="6" y2="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
CloseIcon.displayName = 'CloseIcon';
export { CloseIcon };

const CalendarIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
CalendarIcon.displayName = 'CalendarIcon';
export { CalendarIcon };

const ChevronLeftIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M15 18L9 12L15 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
ChevronLeftIcon.displayName = 'ChevronLeftIcon';
export { ChevronLeftIcon };

const ReceiptIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M4 2V22L6 20L8 22L10 20L12 22L14 20L16 22L18 20L20 22V2L18 4L16 2L14 4L12 2L10 4L8 2L6 4L4 2Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="8" y1="8" x2="16" y2="8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="8" y1="12" x2="16" y2="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
ReceiptIcon.displayName = 'ReceiptIcon';
export { ReceiptIcon };

const EditIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 5l4 4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
EditIcon.displayName = 'EditIcon';
export { EditIcon };

const TruckIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M14 17H4V5H14V17Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 9H19L22 12V17H14V9Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M2 17H14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="6" cy="19" r="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="18" cy="19" r="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
TruckIcon.displayName = 'TruckIcon';
export { TruckIcon };

const MoreVerticalIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Circle cx="12" cy="12" r="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="5" r="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="19" r="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
MoreVerticalIcon.displayName = 'MoreVerticalIcon';
export { MoreVerticalIcon };

const FilterIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Path d="M22 3H2L8 10.46V19L16 22V10.46L22 3Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
FilterIcon.displayName = 'FilterIcon';
export { FilterIcon };

const ChevronDownIcon = createIcon({
  Root: Svg,
  viewBox: '0 0 24 24',
  path: (
    <>
      <Polyline points="6 9 12 15 18 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
});
ChevronDownIcon.displayName = 'ChevronDownIcon';
export { ChevronDownIcon };
