import { getObjectType } from '@/models/DomoObjectType';
import IconAdc from '@icons/adc.svg?react';
import IconAiBook from '@icons/ai-book.svg?react';
import IconAiModel from '@icons/ai-model.svg?react';
import IconAiRobot from '@icons/ai-robot.svg?react';
import IconApprovalCenter from '@icons/approval-center.svg?react';
import IconCalendarTime from '@icons/calendar-time.svg?react';
import IconCardNotebook from '@icons/card-notebook.svg?react';
import IconCard from '@icons/card.svg?react';
import IconCertified from '@icons/certified.svg?react';
import IconCheckIn from '@icons/check-in.svg?react';
import IconClock from '@icons/clock.svg?react';
import IconCodeTags from '@icons/code-tags.svg?react';
import IconCode from '@icons/code.svg?react';
import IconConnector from '@icons/connector.svg?react';
import IconDataApp from '@icons/data-app.svg?react';
import IconDataWarehouse from '@icons/data-warehouse.svg?react';
import IconDatabase from '@icons/database.svg?react';
import IconDataflow from '@icons/dataflow.svg?react';
import IconDocument from '@icons/document.svg?react';
import IconDrill from '@icons/drill.svg?react';
import IconEnvelope from '@icons/envelope.svg?react';
import IconFileDrawer from '@icons/file-drawer.svg?react';
import IconFolder from '@icons/folder.svg?react';
import IconFormatListChecks from '@icons/format-list-checks.svg?react';
import IconFormula from '@icons/formula.svg?react';
import IconGoals from '@icons/goals.svg?react';
import IconKey from '@icons/key.svg?react';
import IconLineage from '@icons/lineage.svg?react';
import IconNewspaper from '@icons/newspaper.svg?react';
import IconPagesBars from '@icons/pages-bars.svg?react';
import IconPeople from '@icons/people.svg?react';
import IconPerson from '@icons/person.svg?react';
import IconPlay from '@icons/play.svg?react';
import IconProject from '@icons/project.svg?react';
import IconRingingBell from '@icons/ringing-bell.svg?react';
import IconSandcastle from '@icons/sandcastle.svg?react';
import IconShield from '@icons/shield.svg?react';
import IconTag from '@icons/tag.svg?react';
import IconToolbox from '@icons/toolbox.svg?react';
import IconVariable from '@icons/variable.svg?react';
import IconVector from '@icons/vector.svg?react';
import IconWorkflow from '@icons/workflow.svg?react';
import IconWorksheets from '@icons/worksheets.svg?react';
import IconWorkspace from '@icons/workspace.svg?react';

const ICON_MAP = {
  Adc: IconAdc,
  AiBook: IconAiBook,
  AiModel: IconAiModel,
  AiRobot: IconAiRobot,
  ApprovalCenter: IconApprovalCenter,
  CalendarTime: IconCalendarTime,
  Card: IconCard,
  CardNotebook: IconCardNotebook,
  Certified: IconCertified,
  CheckIn: IconCheckIn,
  Clock: IconClock,
  Code: IconCode,
  CodeTags: IconCodeTags,
  Connector: IconConnector,
  DataApp: IconDataApp,
  Database: IconDatabase,
  Dataflow: IconDataflow,
  DataWarehouse: IconDataWarehouse,
  Document: IconDocument,
  Drill: IconDrill,
  Envelope: IconEnvelope,
  FileDrawer: IconFileDrawer,
  Folder: IconFolder,
  FormatListChecks: IconFormatListChecks,
  Formula: IconFormula,
  Goals: IconGoals,
  Key: IconKey,
  Lineage: IconLineage,
  Newspaper: IconNewspaper,
  PagesBars: IconPagesBars,
  People: IconPeople,
  Person: IconPerson,
  Play: IconPlay,
  Project: IconProject,
  RingingBell: IconRingingBell,
  Sandcastle: IconSandcastle,
  Shield: IconShield,
  Tag: IconTag,
  Toolbox: IconToolbox,
  Variable: IconVariable,
  Vector: IconVector,
  Workflow: IconWorkflow,
  Worksheets: IconWorksheets,
  Workspace: IconWorkspace
};

export function ObjectTypeIcon({ className, size, typeId }) {
  const icon = getObjectType(typeId)?.icon;
  if (!icon) return null;
  const Component = ICON_MAP[icon.component];
  if (!Component) return null;
  return (
    <Component
      className={className}
      style={icon.rotation ? { transform: `rotate(${icon.rotation}deg)` } : undefined}
      {...(size !== undefined && { height: size, width: size })}
    />
  );
}
