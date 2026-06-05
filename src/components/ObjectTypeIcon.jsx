import { getObjectType } from '@/models/DomoObjectType';
import IconAdc from '@icons/adc.svg?react';
import IconAiBook from '@icons/ai-book.svg?react';
import IconAiModel from '@icons/ai-model.svg?react';
import IconAiRobot from '@icons/ai-robot.svg?react';
import IconApprovalCenter from '@icons/approval-center.svg?react';
import IconBuilding from '@icons/building.svg?react';
import IconCalendarTime from '@icons/calendar-time.svg?react';
import IconCardNotebook from '@icons/card-notebook.svg?react';
import IconCard from '@icons/card.svg?react';
import IconCertifiedCompany from '@icons/certified-company.svg?react';
import IconCertified from '@icons/certified.svg?react';
import IconChartLine from '@icons/chart-line.svg?react';
import IconChatBubble from '@icons/chat-bubble.svg?react';
import IconChatBubbles from '@icons/chat-bubbles.svg?react';
import IconCheckIn from '@icons/check-in.svg?react';
import IconClock from '@icons/clock.svg?react';
import IconCodeTags from '@icons/code-tags.svg?react';
import IconCode from '@icons/code.svg?react';
import IconConnector from '@icons/connector.svg?react';
import IconDataApp from '@icons/data-app.svg?react';
import IconDataCollection from '@icons/data-collection.svg?react';
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
import IconFunction from '@icons/function.svg?react';
import IconGear from '@icons/gear.svg?react';
import IconGoals from '@icons/goals.svg?react';
import IconJupyter from '@icons/jupyter.svg?react';
import IconKey from '@icons/key.svg?react';
import IconLineage from '@icons/lineage.svg?react';
import IconListBulleted from '@icons/list-bulleted.svg?react';
import IconNewspaper from '@icons/newspaper.svg?react';
import IconPackage from '@icons/package.svg?react';
import IconPagesBars from '@icons/pages-bars.svg?react';
import IconPages from '@icons/pages.svg?react';
import IconPeople from '@icons/people.svg?react';
import IconPerson from '@icons/person.svg?react';
import IconPin from '@icons/pin.svg?react';
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
  Building: IconBuilding,
  CalendarTime: IconCalendarTime,
  Card: IconCard,
  CardNotebook: IconCardNotebook,
  Certified: IconCertified,
  CertifiedCompany: IconCertifiedCompany,
  ChartLine: IconChartLine,
  ChatBubble: IconChatBubble,
  ChatBubbles: IconChatBubbles,
  CheckIn: IconCheckIn,
  Clock: IconClock,
  Code: IconCode,
  CodeTags: IconCodeTags,
  Connector: IconConnector,
  DataApp: IconDataApp,
  Database: IconDatabase,
  DataCollection: IconDataCollection,
  Dataflow: IconDataflow,
  DataWarehouse: IconDataWarehouse,
  Document: IconDocument,
  Drill: IconDrill,
  Envelope: IconEnvelope,
  FileDrawer: IconFileDrawer,
  Folder: IconFolder,
  FormatListChecks: IconFormatListChecks,
  Formula: IconFormula,
  Function: IconFunction,
  Gear: IconGear,
  Goals: IconGoals,
  Jupyter: IconJupyter,
  Key: IconKey,
  Lineage: IconLineage,
  ListBulleted: IconListBulleted,
  Newspaper: IconNewspaper,
  Package: IconPackage,
  Pages: IconPages,
  PagesBars: IconPagesBars,
  People: IconPeople,
  Person: IconPerson,
  Pin: IconPin,
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
