import {
  AppWindow,
  Bot,
  Clock3,
  FileText,
  FolderKanban,
  HardDrive,
  Home,
  Image,
  Settings,
  Sparkles,
  WandSparkles,
} from "lucide-react";

interface AppSidebarProps {
  activeView: "home" | "task";
}

const resourceItems = [
  { icon: FileText, label: "文件中心" },
  { icon: Image, label: "图片中心" },
  { icon: AppWindow, label: "应用与此电脑" },
  { icon: Clock3, label: "自动任务" },
  { icon: WandSparkles, label: "技能广场" },
];

export function AppSidebar({ activeView }: AppSidebarProps) {
  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <Sparkles size={23} strokeWidth={2.3} />
        </span>
        <span>
          <strong>LUMORA</strong>
          <small>你的本地 AI 助手</small>
        </span>
      </div>

      <nav className="primary-nav">
        <NavItem icon={Home} label="首页 / 新建任务" active={activeView === "home"} />
        <NavItem icon={Clock3} label="任务执行页" active={activeView === "task"} />
        <NavItem icon={Bot} label="Agent 办公室" />
      </nav>

      <div className="nav-section">
        <div className="nav-section-title">
          <FolderKanban size={17} />
          <span>工作空间</span>
          <button type="button" aria-label="新建工作空间">
            +
          </button>
        </div>
        <button className="workspace-link" type="button">
          <span className="folder-dot" />
          日本旅行资料整理
        </button>
        <button className="workspace-link" type="button">
          <span className="folder-dot" />
          毕业答辩准备
        </button>
      </div>

      <nav className="resource-nav" aria-label="资源">
        {resourceItems.map((item) => (
          <NavItem key={item.label} {...item} />
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <div className="storage-panel">
        <div>
          <HardDrive size={16} />
          <strong>存储空间</strong>
          <span>40%</span>
        </div>
        <small>已使用 120 GB / 297 GB</small>
        <div className="storage-track">
          <span />
        </div>
      </div>

      <div className="profile">
        <span className="avatar" aria-hidden="true">
          A
        </span>
        <div>
          <strong>Ada</strong>
          <small>专业版</small>
        </div>
        <button type="button" aria-label="设置">
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
}

interface NavItemProps {
  icon: typeof Home;
  label: string;
  active?: boolean;
}

function NavItem({ icon: Icon, label, active = false }: NavItemProps) {
  return (
    <button className={`nav-item${active ? " active" : ""}`} type="button">
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}

