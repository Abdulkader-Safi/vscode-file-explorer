(function () {
  const vscode = acquireVsCodeApi();

  // Get state or initialize
  let state = vscode.getState() || {
    favorites: [],
    currentPath: "",
    searchQuery: "",
  };

  // DOM elements
  const fileListElement = document.getElementById("fileList");
  const breadcrumbElement = document.getElementById("breadcrumb");
  const searchInput = document.getElementById("searchInput");
  const favoritesListElement = document.getElementById("favoritesList");
  const devicesListElement = document.getElementById("devicesList");
  const tagsListElement = document.getElementById("tagsList");

  let currentPath = "";
  let currentItems = [];
  let filteredItems = [];
  let clickTimeout = null;
  let lastClickedItem = null;

  // Initialize
  initializeSidebar();
  loadFavorites();
  searchInput.value = state.searchQuery || "";

  // Request initial directory listing
  vscode.postMessage({
    command: "getHomeDirectory",
  });

  // Event Listeners
  searchInput.addEventListener("input", handleSearch);

  // Listen for messages from the extension
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.command) {
      case "updateDirectory":
        currentPath = message.path;
        currentItems = message.items || [];
        updateBreadcrumb(message.path);
        filterAndRenderItems();
        saveState();
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

    // Tags
    const tags = [
      { name: "Important", icon: "🔴", color: "#ff3b30" },
      { name: "Work", icon: "🟠", color: "#ff9500" },
      { name: "Personal", icon: "🟡", color: "#ffcc00" },
    ];

    tags.forEach((tag) => {
      const item = createSidebarItem(tag.name, tag.icon);
      tagsListElement.appendChild(item);
    });
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
      saveState();
      loadFavorites();
    }
  }

  function removeFavorite(path) {
    state.favorites = state.favorites.filter((f) => f.path !== path);
    saveState();
    loadFavorites();
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
    saveState();
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
        selectItem(fileItem);
        vscode.postMessage({
          command: "sendNotification",
          text: `File selected: ${item.name}`,
        });
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
        label: "Add to Favorites",
        action: () => addToFavorites(path, name),
        show: isDirectory,
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

  function saveState() {
    vscode.setState({
      favorites: state.favorites,
      currentPath: currentPath,
      searchQuery: state.searchQuery,
    });
  }

  // Show loading initially
  fileListElement.innerHTML = '<div class="loading">Loading...</div>';
})();
