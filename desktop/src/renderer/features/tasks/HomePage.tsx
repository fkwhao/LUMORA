import { useState } from "react";
import {
  ArrowRight,
  Bot,
  File,
  Globe2,
  LayoutGrid,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { useStore } from "zustand";

import type { TaskStore } from "./task-store";

interface HomePageProps {
  store: TaskStore;
}

const quickActions = [
  { icon: File, label: "文件" },
  { icon: Globe2, label: "网页" },
  { icon: LayoutGrid, label: "应用" },
  { icon: MoreHorizontal, label: "更多" },
];

const recentTasks = [
  { kind: "学术研究", title: "毕业答辩材料准备", meta: "35% · 2 小时前" },
  { kind: "文件整理", title: "下载文件夹整理", meta: "已完成 · 昨天" },
  { kind: "市场分析", title: "市场趋势分析", meta: "等待中 · 7 月 20 日" },
];

export function HomePage({ store }: HomePageProps) {
  const [goal, setGoal] = useState("");
  const isCreating = useStore(store, (state) => state.isCreating);
  const error = useStore(store, (state) => state.error);

  async function submitGoal(event: React.FormEvent) {
    event.preventDefault();
    try {
      await store.getState().createTask(goal);
    } catch {
      // Store 已将用户可理解的错误写入状态，表单只负责阻止未处理拒绝。
    }
  }

  return (
    <main className="home-layout">
      <section className="home-main">
        <header className="welcome">
          <p>早上好，Ada</p>
          <h1>今天，想完成什么？</h1>
        </header>

        <form className="goal-composer" onSubmit={submitGoal}>
          <label htmlFor="task-goal">任务目标</label>
          <textarea
            id="task-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="告诉 LUMORA 你的目标..."
            rows={4}
          />
          <div className="composer-footer">
            <div className="quick-actions">
              {quickActions.map(({ icon: Icon, label }) => (
                <button type="button" key={label}>
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </div>
            <button
              className="submit-task"
              type="submit"
              aria-label="开始任务"
              disabled={isCreating}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}

        <div className="ready-note">
          <Sparkles size={16} />
          你的本地 AI 助手已准备就绪
        </div>

        <section className="active-task">
          <div className="task-visual" aria-hidden="true">
            <div className="visual-sun" />
            <div className="visual-mountain visual-mountain-back" />
            <div className="visual-mountain visual-mountain-front" />
            <div className="visual-label">JAPAN / 2026</div>
          </div>
          <div className="active-task-copy">
            <span>继续进行 · 旅行规划</span>
            <h2>整理日本旅行资料</h2>
            <p>Browser Agent 正在收集交通与景点信息</p>
            <strong>60%</strong>
            <div className="progress-track">
              <span style={{ width: "60%" }} />
            </div>
            <small>12 个文件 · 3 个 Agent</small>
            <button type="button">
              继续处理
              <ArrowRight size={16} />
            </button>
          </div>
        </section>

        <section className="recent-section">
          <div className="section-heading">
            <h2>最近任务</h2>
            <button type="button">
              查看全部
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="recent-grid">
            {recentTasks.map((task, index) => (
              <article className={`recent-item accent-${index + 1}`} key={task.title}>
                <div className="recent-pattern" />
                <small>{task.kind}</small>
                <h3>{task.title}</h3>
                <p>{task.meta}</p>
                <ArrowRight size={17} />
              </article>
            ))}
          </div>
        </section>
      </section>

      <aside className="home-rail">
        <div className="date-label">今日 · 7月24日</div>
        <strong className="task-count">03</strong>
        <p>项任务正在推进</p>

        <section className="rail-section">
          <h2>最近动态</h2>
          <ol className="activity-list">
            <li>
              <time>10:45</time>
              更新 日本交通攻略.pdf
            </li>
            <li>
              <time>10:30</time>
              Browser Agent 收集 4 个网页
            </li>
            <li>
              <time>09:58</time>
              创建工作空间
            </li>
          </ol>
        </section>

        <section className="rail-section">
          <h2>在线 Agent</h2>
          {["Browser Agent", "File Agent", "Writer Agent"].map((agent) => (
            <div className="agent-row" key={agent}>
              <span>
                <Bot size={17} />
              </span>
              <div>
                <strong>{agent}</strong>
                <small>在线</small>
              </div>
            </div>
          ))}
        </section>
      </aside>
    </main>
  );
}

