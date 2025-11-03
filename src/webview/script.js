(function () {
  const vscode = acquireVsCodeApi();

  // State
  let state = {
    favorites: [],
    currentPath: "",
    searchQuery: "",
    showHiddenFiles: false,
    viewMode: "list",
  };

  // DOM elements
  const fileListElement = document.getElementById("fileList");
  const breadcrumbElement = document.getElementById("breadcrumb");
  const searchInput = document.getElementById("searchInput");
  const favoritesListElement = document.getElementById("favoritesList");
  const settingsFavoritesListElement = document.getElementById(
    "settingsFavoritesList"
  );
  const devicesListElement = document.getElementById("devicesList");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsBtn = document.getElementById("closeSettings");
  const showHiddenFilesCheckbox = document.getElementById(
    "showHiddenFilesCheckbox"
  );
  const listViewBtn = document.getElementById("listViewBtn");
  const gridViewBtn = document.getElementById("gridViewBtn");
  const newFileBtn = document.getElementById("newFileBtn");
  const newFolderBtn = document.getElementById("newFolderBtn");
  const explorerContainer = document.querySelector(".explorer-container");
  const inputModal = document.getElementById("inputModal");
  const inputModalTitle = document.getElementById("inputModalTitle");
  const inputModalInput = document.getElementById("inputModalInput");
  const inputModalOk = document.getElementById("inputModalOk");
  const inputModalCancel = document.getElementById("inputModalCancel");
  const closeInputModal = document.getElementById("closeInputModal");

  let currentPath = "";
  let currentItems = [];
  let filteredItems = [];
  let clickTimeout = null;
  let lastClickedItem = null;

  // Initialize
  initializeSidebar();
  closeSettings();

  // Close input modal on startup (in case it was left open)
  if (inputModal) {
    inputModal.style.display = "none";
  }

  // Request initial directory listing
  vscode.postMessage({
    command: "getHomeDirectory",
  });

  // Event Listeners
  searchInput.addEventListener("input", handleSearch);
  settingsBtn.addEventListener("click", openSettings);
  closeSettingsBtn.addEventListener("click", closeSettings);
  showHiddenFilesCheckbox.addEventListener("change", handleHiddenFilesToggle);
  listViewBtn.addEventListener("click", () => setViewMode("list"));
  gridViewBtn.addEventListener("click", () => setViewMode("grid"));
  newFileBtn.addEventListener("click", handleNewFile);
  newFolderBtn.addEventListener("click", handleNewFolder);

  // Close modals when clicking outside
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      closeSettings();
    }
  });

  inputModal.addEventListener("click", (e) => {
    if (e.target === inputModal) {
      // Trigger cancel by clicking the cancel button
      inputModalCancel.click();
    }
  });

  // Listen for messages from the extension
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.command) {
      case "initState":
        state.favorites = message.favorites || [];
        state.showHiddenFiles = message.showHiddenFiles || false;
        state.viewMode = message.viewMode || "list";
        loadFavorites();
        updateSettingsUI();
        break;
      case "updateDirectory":
        currentPath = message.path;
        currentItems = message.items || [];
        state.currentPath = currentPath;
        updateBreadcrumb(message.path);
        filterAndRenderItems();
        break;
      case "error":
        showError(message.text);
        break;
      case "imagePreview":
        updateImagePreview(message.path, message.dataUrl);
        break;
    }
  });

  // Context menu handling
  document.addEventListener("contextmenu", (e) => {
    const fileItem = e.target.closest(".file-item");
    if (fileItem) {
      e.preventDefault();
      showContextMenu(e.pageX, e.pageY, fileItem);
    } else if (
      e.target.closest(".explorer-container") ||
      e.target.closest(".file-list")
    ) {
      // Right-click on empty area
      e.preventDefault();
      showEmptyAreaContextMenu(e.pageX, e.pageY);
    }
  });

  document.addEventListener("click", () => {
    removeContextMenu();
  });

  // Initialize sidebar with default items
  function initializeSidebar() {
    // Devices
    const devices = [
      { name: "Macintosh HD", icon: "💾", path: "/" },
      { name: "USB Drive", icon: "🔌", path: null },
    ];

    devices.forEach((device) => {
      const item = createSidebarItem(device.name, device.icon, () => {
        if (device.path) {
          navigateToPath(device.path);
        }
      });
      devicesListElement.appendChild(item);
    });
  }

  function showEmptyAreaContextMenu(x, y) {
    removeContextMenu();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.id = "contextMenu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    const menuItems = [
      {
        label: "New File",
        action: handleNewFile,
      },
      {
        label: "New Folder",
        action: handleNewFolder,
      },
    ];

    menuItems.forEach((item) => {
      const menuItem = document.createElement("div");
      menuItem.className = "context-menu-item";
      menuItem.textContent = item.label;
      menuItem.addEventListener("click", () => {
        item.action();
        removeContextMenu();
      });
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);
  }

  function createSidebarItem(name, icon, onClick) {
    const item = document.createElement("div");
    item.className = "sidebar-item";

    const iconSpan = document.createElement("span");
    iconSpan.className = "sidebar-icon";
    iconSpan.textContent = icon;

    const nameSpan = document.createElement("span");
    nameSpan.className = "sidebar-name";
    nameSpan.textContent = name;

    item.appendChild(iconSpan);
    item.appendChild(nameSpan);

    if (onClick) {
      item.addEventListener("click", onClick);
    }

    return item;
  }

  function loadFavorites() {
    favoritesListElement.innerHTML = "";
    state.favorites.forEach((fav) => {
      const item = createFavoriteItem(fav);
      favoritesListElement.appendChild(item);
    });
  }

  function createFavoriteItem(fav) {
    const item = document.createElement("div");
    item.className = "sidebar-item";

    const iconSpan = document.createElement("span");
    iconSpan.className = "sidebar-icon";
    iconSpan.textContent = "📁";

    const nameSpan = document.createElement("span");
    nameSpan.className = "sidebar-name";
    nameSpan.textContent = fav.name;

    const removeBtn = document.createElement("span");
    removeBtn.className = "favorite-remove";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFavorite(fav.path);
    });

    item.appendChild(iconSpan);
    item.appendChild(nameSpan);
    item.appendChild(removeBtn);

    item.addEventListener("click", () => {
      navigateToPath(fav.path);
    });

    return item;
  }

  function addToFavorites(path, name) {
    if (!state.favorites.find((f) => f.path === path)) {
      state.favorites.push({ path, name });
      saveFavorites();
      loadFavorites();
    }
  }

  function removeFavorite(path) {
    state.favorites = state.favorites.filter((f) => f.path !== path);
    saveFavorites();
    loadFavorites();
  }

  function saveFavorites() {
    vscode.postMessage({
      command: "saveFavorites",
      favorites: state.favorites,
    });
  }

  function saveSettings(updates) {
    vscode.postMessage({
      command: "saveSettings",
      ...updates,
    });
  }

  function openSettings() {
    settingsModal.style.display = "flex";
  }

  function closeSettings() {
    settingsModal.style.display = "none";
  }

  function showInputModal(title, defaultValue = "") {
    return new Promise((resolve) => {
      inputModalTitle.textContent = title;
      inputModalInput.value = defaultValue;
      inputModal.style.display = "flex";

      // Focus the input after a brief delay to ensure modal is rendered
      setTimeout(() => {
        inputModalInput.focus();
        inputModalInput.select();
      }, 50);

      const handleOk = () => {
        const value = inputModalInput.value.trim();
        cleanup();
        resolve(value || null);
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      const handleKeyDown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleOk();
        } else if (e.key === "Escape") {
          e.preventDefault();
          handleCancel();
        }
      };

      const cleanup = () => {
        inputModal.style.display = "none";
        inputModalInput.value = "";
        inputModalOk.removeEventListener("click", handleOk);
        inputModalCancel.removeEventListener("click", handleCancel);
        closeInputModal.removeEventListener("click", handleCancel);
        inputModalInput.removeEventListener("keydown", handleKeyDown);
      };

      // Remove any existing listeners before adding new ones
      inputModalOk.removeEventListener("click", handleOk);
      inputModalCancel.removeEventListener("click", handleCancel);
      closeInputModal.removeEventListener("click", handleCancel);
      inputModalInput.removeEventListener("keydown", handleKeyDown);

      // Add event listeners
      inputModalOk.addEventListener("click", handleOk, { once: true });
      inputModalCancel.addEventListener("click", handleCancel, { once: true });
      closeInputModal.addEventListener("click", handleCancel, { once: true });
      inputModalInput.addEventListener("keydown", handleKeyDown);
    });
  }

  function updateSettingsUI() {
    showHiddenFilesCheckbox.checked = state.showHiddenFiles;
    listViewBtn.classList.toggle("active", state.viewMode === "list");
    gridViewBtn.classList.toggle("active", state.viewMode === "grid");
    fileListElement.classList.toggle("grid-view", state.viewMode === "grid");
    loadSettingsFavorites();
  }

  function loadSettingsFavorites() {
    settingsFavoritesListElement.innerHTML = "";

    if (state.favorites.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "settings-favorites-empty";
      emptyMessage.textContent =
        "No favorites yet. Right-click a folder to add it to favorites.";
      settingsFavoritesListElement.appendChild(emptyMessage);
      return;
    }

    state.favorites.forEach((fav, index) => {
      const item = createSettingsFavoriteItem(fav, index);
      settingsFavoritesListElement.appendChild(item);
    });
  }

  function createSettingsFavoriteItem(fav, index) {
    const item = document.createElement("div");
    item.className = "settings-favorite-item";
    item.draggable = true;
    item.dataset.index = index;
    item.dataset.path = fav.path;

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "☰";

    const iconSpan = document.createElement("span");
    iconSpan.className = "settings-favorite-icon";
    iconSpan.textContent = "📁";

    const nameSpan = document.createElement("span");
    nameSpan.className = "settings-favorite-name";
    nameSpan.textContent = fav.name;

    const removeBtn = document.createElement("button");
    removeBtn.className = "settings-favorite-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove from favorites";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFavorite(fav.path);
      loadSettingsFavorites();
    });

    item.appendChild(dragHandle);
    item.appendChild(iconSpan);
    item.appendChild(nameSpan);
    item.appendChild(removeBtn);

    // Drag and drop event listeners
    item.addEventListener("dragstart", handleDragStart);
    item.addEventListener("dragend", handleDragEnd);
    item.addEventListener("dragover", handleDragOver);
    item.addEventListener("drop", handleDrop);
    item.addEventListener("dragenter", handleDragEnter);
    item.addEventListener("dragleave", handleDragLeave);

    return item;
  }

  let draggedItem = null;

  function handleDragStart(e) {
    draggedItem = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", this.innerHTML);
  }

  function handleDragEnd() {
    this.classList.remove("dragging");

    // Remove all drag-over classes
    document.querySelectorAll(".settings-favorite-item").forEach((item) => {
      item.classList.remove("drag-over");
    });

    draggedItem = null;
  }

  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = "move";
    return false;
  }

  function handleDragEnter() {
    if (this !== draggedItem) {
      this.classList.add("drag-over");
    }
  }

  function handleDragLeave() {
    this.classList.remove("drag-over");
  }

  function handleDrop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    if (draggedItem !== this) {
      const fromIndex = parseInt(draggedItem.dataset.index);
      const toIndex = parseInt(this.dataset.index);

      // Reorder the favorites array
      const newFavorites = [...state.favorites];
      const [movedItem] = newFavorites.splice(fromIndex, 1);
      newFavorites.splice(toIndex, 0, movedItem);

      state.favorites = newFavorites;
      saveFavorites();
      loadFavorites();
      loadSettingsFavorites();
    }

    return false;
  }

  function handleHiddenFilesToggle() {
    state.showHiddenFiles = showHiddenFilesCheckbox.checked;
    saveSettings({ showHiddenFiles: state.showHiddenFiles });
    // Refresh current directory
    vscode.postMessage({
      command: "openDirectory",
      path: currentPath,
    });
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    saveSettings({ viewMode: mode });
    updateSettingsUI();
  }

  async function handleNewFile() {
    const dirPath = currentPath || state.currentPath;
    if (!dirPath) {
      vscode.postMessage({
        command: "sendNotification",
        text: "Please navigate to a directory first",
      });
      return;
    }
    const fileName = await showInputModal("Enter file name");
    if (fileName) {
      vscode.postMessage({
        command: "createFile",
        dirPath: dirPath,
        fileName: fileName,
      });
    }
  }

  async function handleNewFolder() {
    const dirPath = currentPath || state.currentPath;
    if (!dirPath) {
      vscode.postMessage({
        command: "sendNotification",
        text: "Please navigate to a directory first",
      });
      return;
    }
    const folderName = await showInputModal("Enter folder name");
    if (folderName) {
      vscode.postMessage({
        command: "createFolder",
        dirPath: dirPath,
        folderName: folderName,
      });
    }
  }

  async function handleRename(path, currentName) {
    const newName = await showInputModal("Rename to", currentName);
    if (newName && newName !== currentName) {
      vscode.postMessage({
        command: "renameItem",
        path: path,
        newName: newName,
      });
    }
  }

  function handleDelete(path, isDirectory) {
    vscode.postMessage({
      command: "deleteItem",
      path: path,
      isDirectory: isDirectory,
    });
  }

  function updateBreadcrumb(path) {
    breadcrumbElement.innerHTML = "";
    const parts = path.split("/").filter((p) => p);

    // Add root
    const rootItem = document.createElement("span");
    rootItem.className = "breadcrumb-item";
    rootItem.textContent = "/";
    rootItem.addEventListener("click", () => navigateToPath("/"));
    breadcrumbElement.appendChild(rootItem);

    // Add path parts
    let currentPathBuild = "";
    parts.forEach((part, index) => {
      currentPathBuild += "/" + part;
      const pathToNavigate = currentPathBuild;

      if (index > 0 || parts.length > 1) {
        const separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "›";
        breadcrumbElement.appendChild(separator);
      }

      const item = document.createElement("span");
      item.className = "breadcrumb-item";
      item.textContent = part;
      item.addEventListener("click", () => navigateToPath(pathToNavigate));
      breadcrumbElement.appendChild(item);
    });
  }

  function handleSearch() {
    state.searchQuery = searchInput.value;
    filterAndRenderItems();
  }

  function filterAndRenderItems() {
    const query = searchInput.value.toLowerCase();

    if (!query) {
      filteredItems = currentItems;
    } else {
      filteredItems = currentItems.filter((item) =>
        item.name.toLowerCase().includes(query)
      );
    }

    renderDirectory(filteredItems, currentPath);
  }

  function renderDirectory(items, path) {
    fileListElement.innerHTML = "";

    if (!items || items.length === 0) {
      fileListElement.innerHTML = searchInput.value
        ? '<div class="empty">No files found matching your search</div>'
        : '<div class="empty">Empty directory</div>';
      return;
    }

    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });

    items.forEach((item) => {
      const fileItem = createFileItem(item);
      fileListElement.appendChild(fileItem);
    });

    // Request image previews for image files
    items.forEach((item) => {
      if (item.isImage) {
        vscode.postMessage({
          command: "getImagePreview",
          path: item.path,
        });
      }
    });
  }

  function createFileItem(item) {
    const fileItem = document.createElement("div");
    fileItem.className = "file-item";
    fileItem.dataset.path = item.path;
    fileItem.dataset.isDirectory = item.isDirectory;

    // Name column
    const nameCell = document.createElement("div");
    nameCell.className = "file-item-name";

    const iconContainer = document.createElement("div");
    iconContainer.className = "file-icon-container";

    const icon = document.createElement("span");
    icon.className = "file-icon";
    const iconData = getFileIcon(item);
    icon.textContent = iconData.icon;
    if (item.isDirectory) {
      icon.classList.add("file-type-folder");
    }

    iconContainer.appendChild(icon);

    // Add type badge
    if (!item.isDirectory && iconData.badgeColor) {
      const badge = document.createElement("div");
      badge.className = `file-type-badge ${iconData.badgeClass}`;
      badge.style.backgroundColor = iconData.badgeColor;
      iconContainer.appendChild(badge);
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "file-name";
    nameSpan.textContent = item.name;

    nameCell.appendChild(iconContainer);
    nameCell.appendChild(nameSpan);

    // Modified column
    const modifiedCell = document.createElement("div");
    modifiedCell.className = "file-modified";
    modifiedCell.textContent = formatDate(item.modified);

    // Size column
    const sizeCell = document.createElement("div");
    sizeCell.className = "file-size";
    sizeCell.textContent = item.isDirectory ? "--" : formatSize(item.size);

    // Kind column
    const kindCell = document.createElement("div");
    kindCell.className = "file-kind";
    kindCell.textContent = item.isDirectory ? "Folder" : item.kind || "File";

    fileItem.appendChild(nameCell);
    fileItem.appendChild(modifiedCell);
    fileItem.appendChild(sizeCell);
    fileItem.appendChild(kindCell);

    // Handle double-click
    fileItem.addEventListener("click", () => {
      if (item.isDirectory) {
        if (lastClickedItem === fileItem && clickTimeout) {
          // Double click detected
          clearTimeout(clickTimeout);
          clickTimeout = null;
          lastClickedItem = null;
          navigateToPath(item.path);
        } else {
          // First click
          selectItem(fileItem);
          lastClickedItem = fileItem;
          clickTimeout = setTimeout(() => {
            clickTimeout = null;
            lastClickedItem = null;
          }, 300);
        }
      } else {
        // File clicked
        if (lastClickedItem === fileItem && clickTimeout) {
          // Double click detected - open file
          clearTimeout(clickTimeout);
          clickTimeout = null;
          lastClickedItem = null;
          vscode.postMessage({
            command: "openFile",
            path: item.path,
          });
        } else {
          // First click
          selectItem(fileItem);
          lastClickedItem = fileItem;
          clickTimeout = setTimeout(() => {
            clickTimeout = null;
            lastClickedItem = null;
          }, 300);
        }
      }
    });

    return fileItem;
  }

  function selectItem(item) {
    document.querySelectorAll(".file-item").forEach((el) => {
      el.classList.remove("selected");
    });
    item.classList.add("selected");
  }

  function updateImagePreview(path, dataUrl) {
    const fileItem = document.querySelector(`[data-path="${path}"]`);
    if (fileItem && dataUrl) {
      const iconContainer = fileItem.querySelector(".file-icon-container");
      const existingIcon = iconContainer.querySelector(".file-icon");

      const img = document.createElement("img");
      img.className = "file-preview";
      img.src = dataUrl;
      img.onerror = () => {
        // If image fails to load, keep the icon
        img.remove();
      };

      if (existingIcon) {
        existingIcon.style.display = "none";
      }
      iconContainer.insertBefore(img, iconContainer.firstChild);
    }
  }

  function getFileIcon(item) {
    if (item.isDirectory) {
      return { icon: "📁", badgeColor: null };
    }

    const ext = item.name.split(".").pop().toLowerCase();
    const iconMap = {
      // Images
      jpg: { icon: "🖼️", badgeColor: "#4caf50", badgeClass: "file-type-image" },
      jpeg: {
        icon: "🖼️",
        badgeColor: "#4caf50",
        badgeClass: "file-type-image",
      },
      png: { icon: "🖼️", badgeColor: "#4caf50", badgeClass: "file-type-image" },
      gif: { icon: "🖼️", badgeColor: "#4caf50", badgeClass: "file-type-image" },
      svg: { icon: "🖼️", badgeColor: "#4caf50", badgeClass: "file-type-image" },
      webp: {
        icon: "🖼️",
        badgeColor: "#4caf50",
        badgeClass: "file-type-image",
      },

      // Videos
      mp4: { icon: "🎬", badgeColor: "#ff9800", badgeClass: "file-type-video" },
      mov: { icon: "🎬", badgeColor: "#ff9800", badgeClass: "file-type-video" },
      avi: { icon: "🎬", badgeColor: "#ff9800", badgeClass: "file-type-video" },

      // Audio
      mp3: { icon: "🎵", badgeColor: "#9c27b0", badgeClass: "file-type-audio" },
      wav: { icon: "🎵", badgeColor: "#9c27b0", badgeClass: "file-type-audio" },
      m4a: { icon: "🎵", badgeColor: "#9c27b0", badgeClass: "file-type-audio" },

      // Documents
      pdf: { icon: "📕", badgeColor: "#e91e63", badgeClass: "file-type-pdf" },
      doc: {
        icon: "📘",
        badgeColor: "#2196f3",
        badgeClass: "file-type-document",
      },
      docx: {
        icon: "📘",
        badgeColor: "#2196f3",
        badgeClass: "file-type-document",
      },
      txt: {
        icon: "📄",
        badgeColor: "#2196f3",
        badgeClass: "file-type-document",
      },
      md: {
        icon: "📝",
        badgeColor: "#2196f3",
        badgeClass: "file-type-document",
      },

      // Code
      js: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },
      ts: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },
      py: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },
      java: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },
      cpp: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },
      html: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },
      css: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },
      json: { icon: "📜", badgeColor: "#f44336", badgeClass: "file-type-code" },

      // Archives
      zip: {
        icon: "📦",
        badgeColor: "#795548",
        badgeClass: "file-type-archive",
      },
      rar: {
        icon: "📦",
        badgeColor: "#795548",
        badgeClass: "file-type-archive",
      },
      tar: {
        icon: "📦",
        badgeColor: "#795548",
        badgeClass: "file-type-archive",
      },
      gz: {
        icon: "📦",
        badgeColor: "#795548",
        badgeClass: "file-type-archive",
      },
    };

    return iconMap[ext] || { icon: "📄", badgeColor: null };
  }

  function formatDate(timestamp) {
    if (!timestamp) {
      return "--";
    }
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return (
        "Today at " +
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
    } else if (days === 1) {
      return (
        "Yesterday at " +
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
    } else if (days < 7) {
      return (
        `${days} days ago at ` +
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
    } else if (days < 14) {
      return (
        "Last week at " +
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) {
      return "0 B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function navigateToPath(path) {
    vscode.postMessage({
      command: "openDirectory",
      path: path,
    });
  }

  function showContextMenu(x, y, fileItem) {
    removeContextMenu();

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.id = "contextMenu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    const path = fileItem.dataset.path;
    const isDirectory = fileItem.dataset.isDirectory === "true";
    const name = fileItem.querySelector(".file-name").textContent;

    const menuItems = [
      {
        label: "Open",
        action: () => {
          if (!isDirectory) {
            vscode.postMessage({
              command: "openFile",
              path: path,
            });
          }
        },
        show: !isDirectory,
      },
      {
        label: "Add to Favorites",
        action: () => addToFavorites(path, name),
        show: isDirectory,
      },
      {
        label: "Rename",
        action: () => handleRename(path, name),
        show: true,
      },
      {
        label: "Delete",
        action: () => handleDelete(path, isDirectory),
        show: true,
      },
      {
        label: "Copy Path",
        action: () => {
          vscode.postMessage({
            command: "copyPath",
            path: path,
          });
        },
        show: true,
      },
    ];

    menuItems.forEach((item) => {
      if (item.show) {
        const menuItem = document.createElement("div");
        menuItem.className = "context-menu-item";
        menuItem.textContent = item.label;
        menuItem.addEventListener("click", () => {
          item.action();
          removeContextMenu();
        });
        menu.appendChild(menuItem);
      }
    });

    document.body.appendChild(menu);
  }

  function removeContextMenu() {
    const existingMenu = document.getElementById("contextMenu");
    if (existingMenu) {
      existingMenu.remove();
    }
  }

  function showError(message) {
    fileListElement.innerHTML = `<div class="error">Error: ${message}</div>`;
  }

  // Show loading initially
  fileListElement.innerHTML = '<div class="loading">Loading...</div>';
})();
