import { useState } from "react";
import {
  Blocks,
  Bot,
  Check,
  Clock3,
  FolderKanban,
  Plus,
  Power,
} from "lucide-react";

export type PrototypeView = "workspaces" | "automations" | "skills";

interface PrototypePageProps {
  view: PrototypeView;
  notify(message: string, tone?: "info" | "success"): void;
}

const pageCopy = {
  workspaces: {
    eyebrow: "工作空间",
    title: "组织项目上下文",
    description: "把目录、仓库和常用资料整理成可复用的任务边界。",
  },
  automations: {
    eyebrow: "自动任务",
    title: "让重复工作按计划发生",
    description: "先在本机维护自动任务草稿，调度服务接入后直接复用。",
  },
  skills: {
    eyebrow: "技能与集成",
    title: "扩展 LUMORA 的执行能力",
    description: "浏览并启用能力模块，后续再连接真实技能运行时。",
  },
} as const;

export function PrototypePage({ view, notify }: PrototypePageProps) {
  const copy = pageCopy[view];
  return (
    <main className="prototype-layout">
      <header className="page-toolbar prototype-toolbar">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <span className="prototype-badge">本地原型</span>
      </header>
      {view === "workspaces" && <Workspaces notify={notify} />}
      {view === "automations" && <Automations notify={notify} />}
      {view === "skills" && <Skills notify={notify} />}
    </main>
  );
}

function Workspaces({ notify }: Pick<PrototypePageProps, "notify">) {
  const [workspaces, setWorkspaces] = useState([
    { name: "LUMORA", path: "F:\\project\\LUMORA", active: true },
  ]);

  function addWorkspace() {
    if (workspaces.some((item) => item.name === "新工作空间")) {
      notify("新工作空间草稿已经存在");
      return;
    }
    setWorkspaces((items) => [
      ...items,
      { name: "新工作空间", path: "等待选择本地目录", active: false },
    ]);
    notify("已创建工作空间草稿", "success");
  }

  return (
    <section className="prototype-content">
      <div className="prototype-section-heading">
        <div>
          <h2>工作空间</h2>
          <p>{workspaces.length} 个本地上下文边界</p>
        </div>
        <button type="button" onClick={addWorkspace}>
          <Plus size={15} />
          新建工作空间
        </button>
      </div>
      <div className="workspace-grid">
        {workspaces.map((workspace) => (
          <button
            className={`workspace-card${workspace.active ? " active" : ""}`}
            type="button"
            key={workspace.name}
            onClick={() =>
              notify(`已选择工作空间：${workspace.name}`, "success")
            }
          >
            <span><FolderKanban size={19} /></span>
            <div>
              <strong>{workspace.name}</strong>
              <small>{workspace.path}</small>
            </div>
            {workspace.active && <Check size={16} />}
          </button>
        ))}
      </div>
    </section>
  );
}

function Automations({ notify }: Pick<PrototypePageProps, "notify">) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    "每日工作总结": true,
    "下载目录整理": false,
    "项目状态检查": true,
  });

  return (
    <section className="prototype-content">
      <div className="prototype-section-heading">
        <div>
          <h2>自动任务</h2>
          <p>所有开关当前仅保存在本次应用会话</p>
        </div>
        <button
          type="button"
          onClick={() => notify("已打开自动任务创建器")}
        >
          <Plus size={15} />
          创建自动任务
        </button>
      </div>
      <div className="automation-list">
        {Object.entries(enabled).map(([name, active], index) => (
          <article key={name}>
            <span><Clock3 size={17} /></span>
            <div>
              <strong>{name}</strong>
              <small>{index === 0 ? "每天 18:00" : "触发条件待配置"}</small>
            </div>
            <button
              className={`prototype-switch${active ? " active" : ""}`}
              type="button"
              aria-label={`${active ? "停用" : "启用"}${name}`}
              onClick={() => {
                setEnabled((items) => ({ ...items, [name]: !active }));
                notify(`${name}已${active ? "停用" : "启用"}`, "success");
              }}
            >
              <span />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Skills({ notify }: Pick<PrototypePageProps, "notify">) {
  const [enabledSkills, setEnabledSkills] = useState(() => new Set(["文件操作"]));
  const skills = [
    ["文件操作", "读取、创建和修改授权目录中的文件", FolderKanban],
    ["代码分析", "理解项目结构并生成规范化修改建议", Bot],
    ["网页研究", "收集网页资料并整理来源", Blocks],
  ] as const;

  return (
    <section className="prototype-content">
      <div className="prototype-section-heading">
        <div>
          <h2>本地技能</h2>
          <p>启用状态将在接入技能运行时后持久化</p>
        </div>
      </div>
      <div className="skill-grid">
        {skills.map(([name, description, Icon]) => {
          const active = enabledSkills.has(name);
          return (
            <article key={name}>
              <span><Icon size={19} /></span>
              <div>
                <strong>{name}</strong>
                <p>{description}</p>
              </div>
              <button
                className={active ? "active" : ""}
                type="button"
                onClick={() => {
                  setEnabledSkills((current) => {
                    const next = new Set(current);
                    active ? next.delete(name) : next.add(name);
                    return next;
                  });
                  notify(`${name}已${active ? "停用" : "启用"}`, "success");
                }}
              >
                <Power size={13} />
                {active ? "已启用" : "启用"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
