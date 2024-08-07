import BareClient from "@tomphttp/bare-client";
import clsx from "clsx";
import type {
  MouseEventHandler,
  MutableRefObject,
  ReactElement,
  ReactNode,
} from "react";
import {
  createRef,
  useLayoutEffect,
  useCallback,
  useEffect,
  useMemo,
  forwardRef,
  useRef,
  useState,
  useImperativeHandle,
} from "react";
import type { WebContentRef, Tab } from "./Content";
import WebContent, { translateOut } from "./Content";
import styles from "./styles/Tabs.module.scss";

const Icon = ({ src, bareClient }: { src: string; bareClient: BareClient }) => {
  const formed = new URL(src, global.location.toString());
  const isData = formed.origin !== global.location.origin;
  const [icon, setIcon] = useState<void | string>(isData ? undefined : src);

  useEffect(() => {
    if (!isData) return;

    const abort = new AbortController();

    const promise = (async () => {
      const outgoing = await bareClient.fetch(src, { signal: abort.signal });
      const obj = URL.createObjectURL(await outgoing.blob());
      setIcon(obj);
      return obj;
    })();

    return () => {
      abort.abort();
      promise.then((obj) => URL.revokeObjectURL(obj));
    };
  }, [bareClient, isData, src]);

  return <>{icon && <img src={icon} alt="" className={styles.icon} />}</>;
};

const Tabbing = ({
  tab,
  focused,
  tabList,
  bumpedTab,
  order,
  bumpTab,
  onClick,
  onClose,
  bareClient,
}: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  bumpedTab: number | null;
  order: number;
  focused: boolean;
  tabList: MutableRefObject<HTMLDivElement | null>;
  bumpTab: (by: number) => boolean;
  onClick: MouseEventHandler<HTMLDivElement>;
  onClose: () => void;
  bareClient: BareClient;
}) => {
  const [mouseDown, setMouseDown] = useState(false);
  const origin = useRef<[number, number] | null>(null);
  const moving = useRef(false);
  const [grabX, setGrabX] = useState<number | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  const [prevOffsetLeft, setPrevOffsetLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!container.current) return;
    setPrevOffsetLeft(container.current.offsetLeft);
  }, [order]);

  useLayoutEffect(() => {
    if (tab.key === bumpedTab || mouseDown) return;

    const con = container.current;
    const firstLeft = prevOffsetLeft;
    if (!con || typeof firstLeft !== "number") return;
    const changeInX = firstLeft - con.offsetLeft;

    if (changeInX) {
      // Before the DOM paints, invert child to old position
      con.style.transform = `translateX(${changeInX}px)`;
      con.style.transition = "transform 0s";

      requestAnimationFrame(() => {
        con.style.transform = "";
        con.style.transition = "";
      });
    }
  }, [bumpedTab, mouseDown, order, prevOffsetLeft, tab.key, tab.src]);

  useEffect(() => {
    const con = container.current;
    const tabListC = tabList.current;
    const or = origin.current;

    if (!con || !tabListC || !mouseDown || !or || typeof grabX !== "number")
      return;

    const listener = (event: MouseEvent) => {
      // emulate sensitivity
      if (
        !moving.current &&
        Math.hypot(event.clientX - or[0], event.clientY - or[1]) > 10
      ) {
        moving.current = true;
        con.style.transition = "transform 0s";
        document.documentElement.classList.add("dragging");
      }
      if (!moving.current) return;

      const offset = Math.max(
        Math.min(
          event.clientX - grabX - con.offsetLeft,
          tabListC.offsetWidth -
            tabListC.offsetLeft -
            con.offsetLeft -
            con.offsetWidth
        ),
        0 - con.offsetLeft + tabListC.offsetLeft
      );
      const step = con.clientWidth / 2 + (offset > 0 ? 10 : -10);
      const fromOrigin = or[0] - event.clientX;
      const bumpBy = ~~(offset / step);
      if (bumpBy && Math.abs(fromOrigin) > 10 && bumpTab(bumpBy))
        origin.current = [event.clientX, event.clientY];
      con.style.transform = offset ? `translateX(${offset}px)` : "";
    };

    const mouseUpListener = (event: MouseEvent) => {
      if (event.button !== 0) return;
      document.documentElement.classList.remove("dragging");
      con.style.transform = "";
      con.style.transition = "";
      moving.current = false;
      setMouseDown(false);
    };

    window.addEventListener("mousemove", listener);
    window.addEventListener("mouseup", mouseUpListener);

    return () => {
      window.removeEventListener("mousemove", listener);
      window.removeEventListener("mouseup", mouseUpListener);
    };
  }, [bumpTab, grabX, mouseDown, origin, tabList]);

  return (
    <div
      ref={container}
      className={clsx(styles.tab, focused && styles.focused)}
      title={tab.title}
      style={{
        order,
      }}
      onMouseDown={(event) => {
        onClick(event);
        if (event.buttons !== 1) return;
        setMouseDown(true);
        origin.current = [event.clientX, event.clientY];
        setGrabX(event.clientX - event.currentTarget.offsetLeft);
      }}
    >
      {tab.icon && <Icon src={tab.icon} bareClient={bareClient} />}
      <span className={styles.title}>{tab.title}</span>
      <button
        className={styles.closeTab}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
};

// createTab(src, tabs, setTabs)

const tabKey = (tabs: Tab[]) => {
  for (let i = 0; i !== 1e3; i++) {
    if (tabs.some((tab) => tab.key === i)) continue;
    return i;
  }

  throw new Error("Failure allocating key");
};

interface NavBarRef {
  focusAddressBar(): void;
}

const NavBar = forwardRef<NavBarRef, { tab?: Tab; setTab: (tab: Tab) => void }>(
  ({ tab, setTab }, ref) => {
    const [focused, setFocused] = useState(false);
    const input = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        focusAddressBar: () => input.current?.focus(),
      }),
      [input]
    );

    useEffect(() => {
      if (!input.current || !tab) return;

      if (typeof tab.address === "string" && !focused)
        input.current.value = tab.address;
    }, [tab, focused, input]);

    return (
      <div className={styles.navBar}>
        <div className={styles.actionsLeft}>
          <button
            className={styles.action}
            onClick={() => tab?.contentRef.current?.back()}
          >
            🠔
          </button>
          <button
            className={styles.action}
            onClick={() => tab?.contentRef.current?.forward()}
          >
            ➝
          </button>
          <button
            className={styles.action}
            onClick={() => tab?.contentRef.current?.reload()}
          >
            🗘
          </button>
        </div>
        <form
          className={styles.addressBar}
          onSubmit={(event) => {
            event.preventDefault();
            if (!input.current || !tab) return;
            const formed = new URL(input.current.value).toString();
            const ref =
              createRef<WebContentRef | null>() as MutableRefObject<WebContentRef | null>;
            ref.current = null;
            setTab({
              ...tab,
              src: translateOut(formed),
              address: formed,
              title: formed,
            });
          }}
        >
          <input
            type="text"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            ref={input}
          />
        </form>
      </div>
    );
  }
);

const createTab = (src: string, tl: Tab[]): Tab => {
  const formed = new URL(src).toString();
  const ref =
    createRef<WebContentRef | null>() as MutableRefObject<WebContentRef | null>;
  ref.current = null;

  return {
    src: translateOut(formed),
    address: formed,
    title: formed,
    load: false,
    shouldFocus: false,
    key: tabKey(tl),
    contentRef: ref,
  };
};

const Tabs = ({ initialTabs }: { initialTabs?: string[] }) => {
  const bareClient = useMemo(
    () => new BareClient(new URL(__uv$config.bare, global.location.toString())),
    []
  );
  const tabList = useRef<HTMLDivElement | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [uiScale, setUiScale] = useState(0);

  useEffect(() => {
    const newTabs: Tab[] = [];

    if (initialTabs)
      for (const src of initialTabs) {
        const tab = createTab(src, newTabs);
        tab.shouldFocus = true;
        newTabs.push(tab);
      }

    setTabs(newTabs);
    if (newTabs[0]) focusTab(newTabs[0]);
  }, [initialTabs]);

  const [focusedTabKey, setFocusedTabKey] = useState<number | null>(null);
  const [bumpedTab, setBumpedTab] = useState<number | null>(null);

  const tabbing: ReactElement<typeof Tabbing>[] = [];
  const content: ReactNode[] = [];

  const focusTab = (tab: Tab) => {
    tab.load = true;
    tab.shouldFocus = true;
    setFocusedTabKey(tab.key);
  };

  useEffect(() => {
    const resize = () => {
      setUiScale(
        (tabList.current?.children[0]?.clientWidth || 0) < 150 ? 1 : 0
      );
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [tabs]);

  const setSomeTab = useCallback(
    (tab: Tab | void, newTab: Tab) => {
      if (!tab) return;
      let updated = false;
      for (const key in tab)
        if (tab[key as keyof Tab] !== newTab[key as keyof Tab]) {
          updated = true;
          break;
        }
      if (!updated) return;
      const i = tabs.indexOf(tab);
      if (i !== -1) tabs[i] = newTab;
      setTabs([...tabs]);
    },
    [tabs]
  );

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];

    const destroyTab = () => {
      setTabs([...tabs.filter((t) => t.key !== tab.key)]);
      if (focusedTabKey === tab.key) {
        const i = tabs.indexOf(tab);
        focusTab(tabs[i - 1] || tabs[i + 1] || null);
      }
    };

    const setTab = setSomeTab.bind(null, tab);

    const focused = focusedTabKey === tab.key;

    tabbing.push(
      <Tabbing
        bareClient={bareClient}
        tab={tab}
        setTab={setTab}
        tabList={tabList}
        bumpedTab={bumpedTab}
        order={i}
        bumpTab={(by) => {
          const i = tabs.indexOf(tab);
          if ((by < 0 && i === 0) || (by > 0 && i === tabs.length - 1))
            return false;
          const newTabs = [...tabs];
          newTabs.splice(i, 1);
          newTabs.splice(i + by, 0, tab);
          setTabs(newTabs);
          setBumpedTab(tab.key);
          return true;
        }}
        focused={focused}
        onClick={(event) => {
          if (event.buttons === 4) destroyTab();
          else if (event.buttons === 1) focusTab(tab);
        }}
        onClose={destroyTab}
        key={tab.key}
      />
    );

    // preserve order of content
    // react will reattach the iframe regardless of whatever we do to preserve the value (same keys, memo()) and will break the content
    content[tab.key] = (
      <div
        className={clsx(styles.tabContent, focused && styles.focused)}
        key={tab.key}
      >
        {tab.load && (
          <WebContent ref={tab.contentRef} tab={tab} setTab={setTab} />
        )}
      </div>
    );
  }

  const focusedTab = tabs.find((tab) => tab.key === focusedTabKey);

  useEffect(() => {
    if (!focusedTab || !navBar.current) return;

    if (focusedTab.shouldFocus) {
      navBar.current.focusAddressBar();
      // should setSomeTab
      focusedTab.shouldFocus = false;
    }
  }, [focusedTab, setSomeTab]);

  const navBar = useRef<NavBarRef | null>(null);

  return (
    <>
      <div className={styles.tabs} data-scale={uiScale}>
        <div
          className={styles.tabList}
          ref={tabList}
          onSubmit={(event) => event.preventDefault()}
        >
          {tabbing}
        </div>
        <button
          className={styles.newTab}
          onClick={() => {
            const newTabs = [...tabs];
            const tab = createTab("about:newtab", newTabs);
            newTabs.push(tab);
            focusTab(tab);
            setTabs(newTabs);
          }}
        >
          +
        </button>
      </div>
      <div className={styles.browserBar}>
        <NavBar
          ref={navBar}
          tab={focusedTab}
          setTab={setSomeTab.bind(null, focusedTab)}
        />
      </div>
      {content}
    </>
  );
};

export default Tabs;
