import {
  IconApps,
  IconArrowsSplit,
  IconBell,
  IconBinaryTree,
  IconBrain,
  IconBriefcase,
  IconBuildingWarehouse,
  IconCalendarTime,
  IconChartBar,
  IconChecklist,
  IconClock,
  IconDatabase,
  IconFile,
  IconFileAnalytics,
  IconFolder,
  IconFolderOpen,
  IconForms,
  IconGitBranch,
  IconKey,
  IconLayoutDashboard,
  IconListCheck,
  IconMail,
  IconMathFunction,
  IconNotebook,
  IconPackage,
  IconPlayerPlay,
  IconPlug,
  IconRobot,
  IconRocket,
  IconRosetteDiscountCheck,
  IconRoute,
  IconRubberStamp,
  IconServer,
  IconShare,
  IconShield,
  IconSubtask,
  IconTable,
  IconTag,
  IconTarget,
  IconTargetArrow,
  IconTemplate,
  IconTransfer,
  IconUser,
  IconUsers,
  IconVariable,
  IconVectorSpline,
  IconZoomIn
} from '@tabler/icons-react';

import { getObjectType } from '@/models';

const ICON_MAP = {
  Apps: IconApps,
  ArrowsSplit: IconArrowsSplit,
  Bell: IconBell,
  BinaryTree: IconBinaryTree,
  Brain: IconBrain,
  Briefcase: IconBriefcase,
  BuildingWarehouse: IconBuildingWarehouse,
  CalendarTime: IconCalendarTime,
  ChartBar: IconChartBar,
  Checklist: IconChecklist,
  Clock: IconClock,
  Database: IconDatabase,
  File: IconFile,
  FileAnalytics: IconFileAnalytics,
  Folder: IconFolder,
  FolderOpen: IconFolderOpen,
  Forms: IconForms,
  GitBranch: IconGitBranch,
  Key: IconKey,
  LayoutDashboard: IconLayoutDashboard,
  ListCheck: IconListCheck,
  Mail: IconMail,
  MathFunction: IconMathFunction,
  Notebook: IconNotebook,
  Package: IconPackage,
  PlayerPlay: IconPlayerPlay,
  Plug: IconPlug,
  Robot: IconRobot,
  Rocket: IconRocket,
  RosetteDiscountCheck: IconRosetteDiscountCheck,
  Route: IconRoute,
  RubberStamp: IconRubberStamp,
  Server: IconServer,
  Share: IconShare,
  Shield: IconShield,
  Subtask: IconSubtask,
  Table: IconTable,
  Tag: IconTag,
  Target: IconTarget,
  TargetArrow: IconTargetArrow,
  Template: IconTemplate,
  Transfer: IconTransfer,
  User: IconUser,
  Users: IconUsers,
  Variable: IconVariable,
  VectorSpline: IconVectorSpline,
  ZoomIn: IconZoomIn
};

export function ObjectTypeIcon({ className, size = 14, stroke = 1.5, typeId }) {
  const icon = getObjectType(typeId)?.icon;
  if (!icon) return null;
  const Component = ICON_MAP[icon.component];
  if (!Component) return null;
  return (
    <Component
      className={className}
      size={size}
      stroke={stroke}
      style={
        icon.rotation ? { transform: `rotate(${icon.rotation}deg)` } : undefined
      }
    />
  );
}
