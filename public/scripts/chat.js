(() => {
  const icons = {
    plus: "M12 5v14M5 12h14",
    back: "m15 5-7 7 7 7",
    search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    laptop: "M5 4h14v12H5zM3 20h18l-2-4H5z",
    help: "M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    spark:
      "M12 3c1.5 5.5 3.5 7.5 9 9-5.5 1.5-7.5 3.5-9 9-1.5-5.5-3.5-7.5-9-9 5.5-1.5 7.5-3.5 9-9Z",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    settings:
      "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    send: "m3 11 18-8-8 18-3-8-7-2Zm7 2L21 3",
    file: "M6 3h8l5 5v13H6zM14 3v6h5",
    upload: "M12 16V3m-4 4 4-4 4 4M4 14v7h16v-7",
    text: "M4 4h16v11H9l-5 5zM8 8h8M8 11h5",
    chevron: "m9 5 7 7-7 7",
  };
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.laptop}"/></svg>`;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const c = (key) => window.ChatCopy(key);
  class ChatUI {
    constructor() {
      this.root = $("chat-app");
      this.feed = $("chat-feed");
      this.peers = new Map();
      this.messages = new Map();
      this.unread = new Map();
      this.selected = null;
      this.ready = false;
      this.selfName = "";
      this.urls = new Set();
      this.noticeKey = "";
      this.drafts = new Map();
      this.mobileLayout = matchMedia("(max-width:600px)");
      this.installMobileZoomGuard();
      this.installPeerMenu();
      this.aliases = {};
      try {
        this.aliases =
          JSON.parse(localStorage.getItem("openuse:device-notes") || "{}") ||
          {};
      } catch {}
      try {
        this.deviceId = localStorage.getItem("openuse:device-id");
      } catch {}
      if (!this.deviceId) {
        this.deviceId = Array.from(
          crypto.getRandomValues(new Uint8Array(16)),
          (value) => value.toString(16).padStart(2, "0"),
        ).join("");
        try {
          localStorage.setItem("openuse:device-id", this.deviceId);
        } catch {}
      }
      $("chat-name-form").addEventListener("submit", (event) => {
        event.preventDefault();
        void this.saveName();
      });
      this.root
        .querySelectorAll("[data-icon]")
        .forEach((node) => (node.innerHTML = icon(node.dataset.icon)));
      this.root.addEventListener("click", (event) => {
        const action = event.target.closest("[data-action]");
        if (action) this.action(action.dataset.action);
      });
      this.root.querySelector(".chat-main").addEventListener("click", () => {
        if (this.mobileLayout.matches && this.root.classList.contains("show-sidebar"))
          this.root.classList.remove("show-sidebar");
      });
      this.mobileLayout.addEventListener("change", () => {
        this.root.classList.remove("show-sidebar");
        this.renderPeers();
      });
      $("chat-home").addEventListener("click", () => this.select(null));
      $("chat-search").addEventListener("input", () => this.renderPeers());
      $("chat-form").addEventListener("submit", (event) => {
        event.preventDefault();
        this.sendText();
      });
      $("chat-message").addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          this.sendText();
        }
      });
      $("chat-message").addEventListener("input", (event) => {
        event.target.style.height = "44px";
        event.target.style.height =
          Math.min(140, event.target.scrollHeight) + "px";
      });
      $("chat-file-input").addEventListener("change", (event) => {
        this.sendFiles([...event.target.files]);
        event.target.value = "";
      });
      this.root.addEventListener("paste", (event) => {
        event.stopPropagation();
        const files = [...(event.clipboardData?.files || [])];
        if (files.length) {
          event.preventDefault();
          this.sendFiles(files);
        }
      });
      this.root.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.root.querySelector(".chat-main").classList.add("is-dragging");
      });
      this.root.addEventListener("dragleave", (event) => {
        if (!this.root.contains(event.relatedTarget))
          this.root.querySelector(".chat-main").classList.remove("is-dragging");
      });
      this.root.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.root.querySelector(".chat-main").classList.remove("is-dragging");
        this.sendFiles([...(event.dataTransfer?.files || [])]);
      });
      Events.on("translation-loaded", () => this.localize());
      Events.on("ws-connected", () => {
        this.ready = true;
        this.updateConnection();
      });
      Events.on("ws-disconnected", () => {
        this.ready = false;
        this.peers.forEach((peer) => (peer.online = false));
        this.markDisconnected();
        this.renderPeers();
        this.updateConnection();
      });
      Events.on("display-name", (event) => {
        this.originalName = event.detail.displayName;
        this.selfName = event.detail.displayName;
        this.updateConnection();
      });
      Events.on("self-display-name-changed", (event) => {
        this.selfName =
          typeof event.detail === "string"
            ? event.detail || this.originalName
            : this.selfName;
        this.updateConnection();
      });
      Events.on("peers", (event) =>
        event.detail.peers.forEach((peer) => this.addPeer(peer)),
      );
      Events.on("peer-joined", (event) => this.addPeer(event.detail.peer));
      Events.on("peer-connected", (event) => {
        const peer = this.peers.get(event.detail.peerId);
        if (peer) peer.online = true;
        this.renderPeers();
        this.updateConnection();
      });
      Events.on("peer-disconnected", (event) => {
        const peer = this.peers.get(
          typeof event.detail === "string" ? event.detail : event.detail.peerId,
        );
        if (peer) peer.online = false;
        this.markDisconnected();
        this.renderPeers();
        this.updateConnection();
      });
      Events.on("peer-display-name-changed", (event) => {
        const peer = this.peers.get(event.detail.peerId);
        if (peer && event.detail.displayName)
          peer.name.displayName = event.detail.displayName;
        if (peer && event.detail.deviceId) {
          peer.deviceId = event.detail.deviceId;
          const oldKey = "peer:" + event.detail.peerId;
          if (
            this.aliases[oldKey] &&
            !this.aliases["device:" + peer.deviceId]
          ) {
            this.aliases["device:" + peer.deviceId] = this.aliases[oldKey];
            try {
              localStorage.setItem(
                "openuse:device-notes",
                JSON.stringify(this.aliases),
              );
            } catch {}
          }
        }
        this.renderPeers();
        this.updateConnection();
      });
      Events.on("text-received", (event) => {
        this.addMessage(event.detail.peerId, {
          type: "text",
          direction: "in",
          text: event.detail.text,
          state: "received",
        });
        this.sound();
      });
      Events.on("text-transfer-complete", (event) =>
        this.finish(event.detail.peerId, "text", "sent"),
      );
      Events.on("files-transfer-request", (event) =>
        this.addMessage(event.detail.peerId, {
          type: "request",
          request: {
            ...event.detail.request,
            header: event.detail.request.header.map((file) => ({ ...file })),
          },
          state: "waiting",
          direction: "in",
        }),
      );
      Events.on("files-received", (event) => {
        this.settleRequests(event.detail.peerId, "received");
        for (const file of event.detail.files)
          this.addMessage(event.detail.peerId, {
            type: "file",
            direction: "in",
            file,
            state: "received",
          });
        this.sound();
      });
      Events.on("chat-files-sent", (event) =>
        this.finish(event.detail.peerId, "file", "sent"),
      );
      Events.on("chat-files-declined", (event) =>
        this.finish(event.detail.peerId, "file", "rejected"),
      );
      Events.on("set-progress", (event) => {
        const p = event.detail;
        const messages = this.messages.get(p.peerId) || [];
        messages
          .filter(
            (m) =>
              m.direction === "out" &&
              m.type === "file" &&
              ["sending", "waiting"].includes(m.state),
          )
          .forEach((m) => {
            m.state = p.status === "wait" ? "waiting" : "sending";
            m.progress =
              p.status === "transfer"
                ? Math.round(p.progress * 100)
                : undefined;
          });
        if (p.peerId === this.selected) this.renderFeed();
      });
      window.addEventListener("pagehide", (event) => {
        if (!event.persisted)
          this.urls.forEach((url) => URL.revokeObjectURL(url));
      });
      this.localize();
    }
    installMobileZoomGuard() {
      const preventZoom = (event) => event.preventDefault();
      document.addEventListener("gesturestart", preventZoom, { passive: false });
      document.addEventListener("gesturechange", preventZoom, { passive: false });
      document.addEventListener("gestureend", preventZoom, { passive: false });
      document.addEventListener(
        "touchmove",
        (event) => {
          if (event.touches.length > 1) event.preventDefault();
        },
        { passive: false },
      );
      let lastTouchEnd = 0;
      document.addEventListener(
        "touchend",
        (event) => {
          const now = Date.now();
          if (now - lastTouchEnd < 300) event.preventDefault();
          lastTouchEnd = now;
        },
        { passive: false },
      );
    }
    sound() {
      const result = $("blop")?.play();
      result?.catch(() => {});
    }
    addPeer(peer) {
      if (!peer) return;
      const old = this.peers.get(peer.id);
      this.peers.set(peer.id, {
        ...peer,
        deviceId: old?.deviceId,
        online: old?.online || false,
      });
      this.renderPeers();
    }
    name(id) {
      const note = this.aliases[this.noteKey(id)];
      return (
        (typeof note === "string" && note) ||
        this.peers.get(id)?.name?.displayName ||
        "PairDrop"
      );
    }
    installPeerMenu() {
      const list = $("chat-peer-list");
      const menu = $("chat-peer-menu");
      list.addEventListener("contextmenu", (event) => {
        const button = event.target.closest("[data-peer-id]");
        if (!button) return;
        event.preventDefault();
        this.openPeerMenu(button.dataset.peerId, event.clientX, event.clientY);
      });
      list.addEventListener("keydown", (event) => {
        const button = event.target.closest("[data-peer-id]");
        if (
          button &&
          (event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10"))
        ) {
          event.preventDefault();
          const rect = button.getBoundingClientRect();
          this.openPeerMenu(button.dataset.peerId, rect.left + 20, rect.bottom);
        }
      });
      let timer, start;
      const cancel = () => {
        clearTimeout(timer);
        start = null;
      };
      list.addEventListener("pointerdown", (event) => {
        cancel();
        const button = event.target.closest("[data-peer-id]");
        if (!button || event.pointerType !== "touch") return;
        start = { x: event.clientX, y: event.clientY };
        const id = button.dataset.peerId;
        timer = setTimeout(() => {
          this.longPressedPeer = id;
          this.suppressPeerClickUntil = Date.now() + 1000;
          this.openPeerMenu(id, event.clientX, event.clientY);
        }, 550);
      });
      list.addEventListener("pointermove", (event) => {
        if (
          start &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
        )
          cancel();
      });
      list.addEventListener("pointerup", cancel);
      list.addEventListener("pointercancel", cancel);
      document.addEventListener("pointerdown", (event) => {
        if (!menu.contains(event.target)) this.closePeerMenu(false);
      });
      menu.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.closePeerMenu(true);
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const items = [...menu.querySelectorAll("button:not(:disabled)")];
          const index = items.indexOf(document.activeElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : event.key === "ArrowDown"
                  ? (index + 1) % items.length
                  : (index - 1 + items.length) % items.length;
          items[next]?.focus();
        }
        if (event.key === "Tab") this.closePeerMenu(false);
      });
      window.addEventListener("resize", () => this.closePeerMenu(false));
      list.addEventListener("scroll", () => this.closePeerMenu(false));
    }
    openPeerMenu(id, x, y) {
      this.contextPeer = id;
      const menu = $("chat-peer-menu");
      const busy = (this.messages.get(id) || []).some((message) =>
        ["sending", "waiting"].includes(message.state),
      );
      $("chat-delete-conversation").disabled = busy;
      $("chat-delete-conversation").title = busy ? c("busy") : "";
      menu.hidden = false;
      const bounds = menu.getBoundingClientRect();
      menu.style.left =
        Math.max(8, Math.min(x, innerWidth - bounds.width - 8)) + "px";
      menu.style.top =
        Math.max(8, Math.min(y, innerHeight - bounds.height - 8)) + "px";
      menu.querySelector("button").focus();
    }
    closePeerMenu(restoreFocus) {
      $("chat-peer-menu").hidden = true;
      if (restoreFocus)
        [...$("chat-peer-list").querySelectorAll("[data-peer-id]")]
          .find((button) => button.dataset.peerId === this.contextPeer)
          ?.focus();
    }
    finishDeletedConversation() {
      clearTimeout(this.deleteTimer);
      if (this.deletedConversation)
        for (const message of this.deletedConversation.messages) {
          if (message.url) {
            URL.revokeObjectURL(message.url);
            this.urls.delete(message.url);
          }
        }
      this.deletedConversation = null;
      $("chat-delete-notice").hidden = true;
    }
    deleteConversation(id) {
      if (!id) return;
      const messages = this.messages.get(id) || [];
      if (
        messages.some((message) =>
          ["sending", "waiting"].includes(message.state),
        )
      ) {
        this.notice("busy");
        return;
      }
      this.finishDeletedConversation();
      const selected = this.selected === id;
      const draft = selected ? $("chat-message").value : this.drafts.get(id);
      this.deletedConversation = {
        id,
        messages,
        draft,
        unread: this.unread.get(id),
        selected,
      };
      if (selected) this.select(null);
      this.messages.delete(id);
      this.unread.delete(id);
      this.drafts.delete(id);
      this.renderPeers();
      this.renderFeed();
      $("chat-delete-notice").hidden = false;
      this.deleteTimer = setTimeout(
        () => this.finishDeletedConversation(),
        15000,
      );
    }
    undoDeleteConversation() {
      const backup = this.deletedConversation;
      if (!backup) return;
      clearTimeout(this.deleteTimer);
      this.deletedConversation = null;
      this.messages.set(backup.id, [
        ...backup.messages,
        ...(this.messages.get(backup.id) || []),
      ]);
      if (backup.draft) this.drafts.set(backup.id, backup.draft);
      if (backup.unread)
        this.unread.set(
          backup.id,
          (this.unread.get(backup.id) || 0) + backup.unread,
        );
      $("chat-delete-notice").hidden = true;
      if (backup.selected && !this.selected) this.select(backup.id);
      else {
        this.renderPeers();
        this.renderFeed();
      }
    }
    noteKey(id) {
      const deviceId = this.peers.get(id)?.deviceId;
      return deviceId ? "device:" + deviceId : "peer:" + id;
    }
    async editName(mode, peerId = this.selected) {
      if (mode === "self" && !this.ready) {
        this.notice("connecting");
        return;
      }
      if (mode === "remark" && !peerId) {
        this.notice("choose");
        return;
      }
      this.nameTarget = mode === "remark" ? peerId : null;
      this.nameMode = mode;
      const initial =
        mode === "self"
          ? await pairDrop.footerUI._getSavedDisplayName()
          : this.aliases[this.noteKey(this.nameTarget)] || "";
      $("chat-name-title").textContent = c(
        mode === "self" ? "renameSelf" : "remark",
      );
      $("chat-name-label").textContent = c(
        mode === "self" ? "nameLabel" : "remarkLabel",
      );
      $("chat-name-help").textContent = c(
        mode === "self" ? "nameHelp" : "remarkHelp",
      );
      $("chat-name-error").textContent = "";
      $("chat-name-input").value = initial;
      $("chat-name-input").placeholder =
        mode === "self"
          ? this.originalName || ""
          : this.peers.get(this.nameTarget)?.name?.displayName || "";
      $("chat-name-dialog").showModal();
      $("chat-name-input").focus();
      $("chat-name-input").select();
    }
    async saveName() {
      const value = $("chat-name-input").value.trim().slice(0, 40);
      $("chat-name-save").disabled = true;
      try {
        if (this.nameMode === "self") {
          try {
            if (value)
              await PersistentStorage.set("edited_display_name", value);
            else await PersistentStorage.delete("edited_display_name");
            try {
              localStorage.removeItem("edited_display_name");
            } catch {}
          } catch {
            if (value) localStorage.setItem("edited_display_name", value);
            else localStorage.removeItem("edited_display_name");
          }
          Events.fire("self-display-name-changed", value);
          Events.fire("broadcast-send", {
            type: "self-display-name-changed",
            detail: value,
          });
        } else {
          const key = this.noteKey(this.nameTarget);
          const next = { ...this.aliases };
          if (value) next[key] = value;
          else delete next[key];
          delete next["peer:" + this.nameTarget];
          if (value && key === "peer:" + this.nameTarget) next[key] = value;
          localStorage.setItem("openuse:device-notes", JSON.stringify(next));
          this.aliases = next;
          this.renderPeers();
          this.updateConnection();
        }
        $("chat-name-dialog").close();
      } catch {
        $("chat-name-error").textContent = c("nameError");
      } finally {
        $("chat-name-save").disabled = false;
      }
    }
    connected(id) {
      return this.ready && this.peers.get(id)?.online;
    }
    select(id) {
      this.drafts.set(this.selected, $("chat-message").value);
      this.selected = id;
      this.unread.delete(id);
      $("chat-message").value = this.drafts.get(id) || "";
      this.notice("");
      this.root.classList.remove("show-sidebar");
      this.renderPeers();
      this.updateConnection();
      this.renderFeed();
    }
    ensurePeer() {
      if (this.selected && this.connected(this.selected)) return this.selected;
      const online = [...this.peers].filter(
        ([, peer]) => peer.online && this.ready,
      );
      if (!this.selected && online.length === 1) {
        this.select(online[0][0]);
        return this.selected;
      }
      this.notice(this.selected ? "disconnected" : "choose");
      if (matchMedia("(max-width:600px)").matches)
        this.root.classList.add("show-sidebar");
      return null;
    }
    notice(key) {
      this.noticeKey = key;
      $("chat-notice").textContent = key ? c(key) : "";
    }
    action(action) {
      if (action === "context-remark") {
        const id = this.contextPeer;
        this.closePeerMenu(false);
        void this.editName("remark", id);
      }
      if (action === "context-delete") {
        const id = this.contextPeer;
        this.closePeerMenu(false);
        this.deleteConversation(id);
      }
      if (action === "undo-delete") this.undoDeleteConversation();
      if (action === "rename-self") void this.editName("self");
      if (action === "remark") void this.editName("remark");
      if (action === "cancel-name") $("chat-name-dialog").close();
      if (action === "files") {
        if (this.ensurePeer()) $("chat-file-input").click();
      }
      if (action === "text") {
        $("chat-message").focus();
        if (!this.selected) this.notice("choose");
      }
      if (action === "connect") {
        if (this.ready) $("pair-device").click();
        else this.notice("connecting");
      }
      if (action === "rooms") {
        if (this.ready) $("join-public-room").click();
        else this.notice("connecting");
      }
      if (action === "devices" || action === "back") {
        this.root.classList.toggle("show-sidebar");
        $("chat-search").focus();
      }
      if (action === "help") location.hash = "about";
      if (action === "settings" || action === "menu") {
        $("chat-settings").hidden = !$("chat-settings").hidden;
      }
      if (action === "language") $("language-selector").click();
      if (action === "paired") {
        if (this.ready) $("edit-paired-devices").click();
        else this.notice("connecting");
      }
      if (action === "theme") {
        if (typeof pairDrop !== "undefined") {
          document.body.classList.contains("dark-theme")
            ? pairDrop.themeUI.setModeToLight()
            : pairDrop.themeUI.setModeToDark();
        }
      }
      if (action === "emoji") {
        const input = $("chat-message");
        input.setRangeText(
          "😊",
          input.selectionStart,
          input.selectionEnd,
          "end",
        );
        input.focus();
      }
      if (!["settings", "menu"].includes(action))
        $("chat-settings").hidden = true;
    }
    sendText() {
      const input = $("chat-message");
      const text = input.value.trim();
      if (!text) return;
      const to = this.ensurePeer();
      if (!to) return;
      this.addMessage(to, {
        type: "text",
        direction: "out",
        text,
        state: "sending",
      });
      Events.fire("send-text", { to, text });
      input.value = "";
      input.style.height = "44px";
      this.drafts.delete(to);
      input.focus();
    }
    sendFiles(files) {
      if (!files.length) return;
      const to = this.ensurePeer();
      if (!to) return;
      const busy = (this.messages.get(to) || []).some(
        (m) =>
          m.type === "file" &&
          m.direction === "out" &&
          ["sending", "waiting"].includes(m.state),
      );
      if (busy) {
        this.notice("busy");
        return;
      }
      this.notice("");
      for (const file of files)
        this.addMessage(to, {
          type: "file",
          direction: "out",
          file,
          state: "waiting",
        });
      Events.fire("files-selected", { to, files });
    }
    addMessage(id, message) {
      if (!id) return;
      message.time = new Date();
      const list = this.messages.get(id) || [];
      if (message.file && message.direction === "in") {
        message.url = URL.createObjectURL(message.file);
        this.urls.add(message.url);
      }
      list.push(message);
      if (list.length > 200) {
        const old = list.shift();
        if (old.url) {
          URL.revokeObjectURL(old.url);
          this.urls.delete(old.url);
        }
      }
      this.messages.set(id, list);
      if (message.direction === "in" && this.selected && this.selected !== id)
        this.unread.set(id, (this.unread.get(id) || 0) + 1);
      if (!this.selected && message.direction === "in") this.select(id);
      else if (this.selected === id) this.renderFeed();
      this.renderPeers();
    }
    finish(id, type, state) {
      const list = this.messages.get(id) || [];
      const pending = list.filter(
        (m) =>
          m.type === type &&
          m.direction === "out" &&
          ["sending", "waiting"].includes(m.state),
      );
      if (type === "text") {
        if (pending[0]) pending[0].state = state;
      } else
        pending.forEach((m) => {
          m.state = state;
          m.progress = undefined;
        });
      if (id === this.selected) this.renderFeed();
      this.renderPeers();
    }
    settleRequests(id, state) {
      (this.messages.get(id) || [])
        .filter(
          (m) =>
            m.type === "request" && ["waiting", "sending"].includes(m.state),
        )
        .forEach((m) => (m.state = state));
    }
    markDisconnected() {
      this.messages.forEach((list, id) => {
        if (!this.connected(id))
          list.forEach((m) => {
            if (["sending", "waiting"].includes(m.state))
              m.state = "disconnected";
          });
      });
      this.renderFeed();
    }
    localize() {
      this.root
        .querySelectorAll("[data-chat]")
        .forEach((node) => (node.textContent = c(node.dataset.chat)));
      this.root
        .querySelectorAll("[data-placeholder]")
        .forEach((node) => (node.placeholder = c(node.dataset.placeholder)));
      this.root.querySelectorAll("[data-label]").forEach((node) => {
        node.setAttribute("aria-label", c(node.dataset.label));
        node.title = c(node.dataset.label);
      });
      $("chat-language-button").textContent =
        c("language") +
        " · " +
        (typeof Localization !== "undefined"
          ? Localization.getLocale() || ""
          : "");
      $("chat-theme-button").textContent = c("theme") + " · ◐";
      $("chat-form").title = c("session") + " · " + c("relay");
      this.notice(this.noticeKey);
      this.renderPeers();
      this.renderFeed();
      this.updateConnection();
    }
    updateConnection() {
      this.root.classList.toggle("is-offline", !this.ready);
      $("chat-title").textContent = this.selected
        ? this.name(this.selected)
        : "PairDrop";
      $("chat-connection").textContent = this.selected
        ? this.connected(this.selected)
          ? c("connected")
          : c("offline")
        : this.ready
          ? c("online")
          : c("connecting");
      $("chat-remark-button").hidden = !this.selected;
      $("chat-self-name").textContent = this.selfName
        ? c("myDevice") + " · " + this.selfName
        : c("myDevice");
    }
    renderPeers() {
      const list = $("chat-peer-list");
      list.replaceChildren();
      const query = $("chat-search").value.toLowerCase();
      let online = 0;
      this.peers.forEach((peer, id) => {
        if (this.mobileLayout.matches && !peer.online) return;
        if (!peer.online && !(this.messages.get(id) || []).length) return;
        if (peer.online) online++;
        const name = this.name(id);
        const device = peer.name?.deviceName || "";
        if (
          !(name + " " + (peer.name?.displayName || "") + " " + device)
            .toLowerCase()
            .includes(query)
        )
          return;
        const button = el(
          "button",
          "chat-nav-row" + (id === this.selected ? " is-active" : ""),
        );
        button.type = "button";
        button.dataset.peerId = id;
        button.setAttribute("aria-pressed", String(id === this.selected));
        const avatar = el("span", "chat-circle-icon");
        avatar.innerHTML = icon("laptop");
        const text = el("span");
        text.append(
          el("strong", "", name),
          el("small", "", device + (peer.online ? "" : " · " + c("offline"))),
        );
        button.append(avatar, text);
        if (this.unread.get(id))
          button.append(el("span", "chat-unread", String(this.unread.get(id))));
        else if (peer.online) button.append(el("span", "chat-live-badge", "●"));
        button.addEventListener("click", () => {
          if (
            this.longPressedPeer === id &&
            Date.now() < this.suppressPeerClickUntil
          ) {
            this.longPressedPeer = null;
            return;
          }
          this.select(id);
        });
        list.append(button);
      });
      $("chat-device-count").textContent = String(online);
      $("chat-device-count").hidden = online === 0;
      this.root.querySelector(".chat-search").hidden =
        [...this.peers].filter(
          ([id, peer]) => peer.online || (this.messages.get(id) || []).length,
        ).length < 4 && !query;
      this.root.querySelector(".chat-device-empty").hidden =
        list.childElementCount > 0;
      $("chat-home").classList.toggle("is-active", !this.selected);
    }
    bubble(direction) {
      const row = el(
        "div",
        "chat-message-row" + (direction === "out" ? " is-outgoing" : ""),
      );
      if (direction !== "out") {
        const avatar = el("img", "chat-avatar");
        avatar.src = "images/openuse-logo.png";
        avatar.alt = "";
        row.append(avatar);
      }
      const bubble = el("div", "chat-bubble");
      row.append(bubble);
      this.feed.append(row);
      return bubble;
    }
    welcome() {
      const empty = el("div", "chat-empty-state");
      const image = el("span", "chat-empty-icon");
      image.innerHTML = icon("laptop");
      empty.append(image, el("p", "", c("choose")));
      const connect = el("button", "chat-connect-button", c("connect"));
      connect.dataset.action = "connect";
      empty.append(connect);
      this.feed.append(empty);
    }
    renderFeed() {
      if (!this.feed) return;
      const nearBottom =
        this.feed.scrollHeight - this.feed.scrollTop - this.feed.clientHeight <
        100;
      const oldScroll = this.feed.scrollTop;
      this.feed.replaceChildren();
      if (!this.selected) this.welcome();
      const list = this.messages.get(this.selected) || [];
      if (list.length) this.feed.append(el("div", "chat-date", c("today")));
      list.forEach((message) => {
        const bubble = this.bubble(message.direction);
        if (message.type === "text") {
          bubble.append(el("div", "chat-message-text", message.text));
          const copy = el("button", "chat-download", c("copy"));
          copy.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(message.text);
              copy.textContent = c("copied");
            } catch {
              this.notice("text");
            }
          });
          if (message.direction === "in") bubble.append(copy);
        }
        if (message.type === "file") {
          const file = el("div", "chat-file");
          const image = el("span", "chat-file-icon");
          image.innerHTML = icon("file");
          const text = el("span");
          text.append(
            el("strong", "", message.file.name),
            el("small", "", this.size(message.file.size)),
          );
          file.append(image, text);
          bubble.append(file);
          if (message.url) {
            const link = el("a", "chat-download", c("download"));
            link.href = message.url;
            link.download = message.file.name;
            bubble.append(link);
          }
        }
        if (message.type === "request") {
          bubble.append(el("strong", "", c("files")));
          message.request.header.forEach((file) =>
            bubble.append(
              el("p", "", file.name + " · " + this.size(file.size)),
            ),
          );
          if (message.state === "waiting") {
            for (const accepted of [true, false]) {
              const button = el(
                "button",
                accepted ? "chat-accept" : "chat-decline",
                c(accepted ? "accept" : "decline"),
              );
              button.addEventListener("click", () => {
                message.state = accepted ? "sending" : "rejected";
                if (accepted && typeof NoSleepUI !== "undefined")
                  NoSleepUI.enable();
                Events.fire("respond-to-files-transfer-request", {
                  to: this.selected,
                  accepted,
                });
                this.renderFeed();
              });
              bubble.append(button);
            }
          }
        }
        const meta = el("div", "chat-message-meta");
        meta.dataset.state = message.state;
        meta.append(
          el(
            "span",
            "",
            c(message.state) +
              (message.progress !== undefined
                ? " " + message.progress + "%"
                : ""),
          ),
          el(
            "time",
            "",
            new Intl.DateTimeFormat(document.documentElement.lang || "en", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(message.time),
          ),
        );
        bubble.append(meta);
      });
      if (nearBottom) this.feed.scrollTop = this.feed.scrollHeight;
      else this.feed.scrollTop = oldScroll;
    }
    size(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(1) + " MB";
    }
  }
  window.openUseChat = new ChatUI();
})();
