import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link as LinkIcon,
  LogIn,
  LogOut,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { app, firebaseReady } from './services/firebase';
import './styles.css';

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const defaultFilters = {
  searchTerm: '',
  selectedCategories: [],
  favoritesOnly: false,
  purchaseFilter: 'all',
};

function getPresenceProfile(email = '') {
  const cleanEmail = email.toLowerCase();
  if (cleanEmail === 'aly0ciah@gmail.com') {
    return { color: '#ff4fb3', label: 'Aly' };
  }
  return { color: '#f0c419', label: 'Matheus' };
}

function normalizeFilters(filters = {}) {
  return {
    searchTerm: typeof filters.searchTerm === 'string' ? filters.searchTerm : '',
    selectedCategories: normalizeCategories(filters.selectedCategories || []),
    favoritesOnly: Boolean(filters.favoritesOnly),
    purchaseFilter: ['all', 'bought', 'pending'].includes(filters.purchaseFilter)
      ? filters.purchaseFilter
      : 'all',
  };
}

function normalizeLinks(links = []) {
  return links.map((link) => ({
    id: link.id || crypto.randomUUID(),
    title: link.title || '',
    url: link.url || '',
    note: link.note || '',
    favorite: Boolean(link.favorite),
  }));
}

function normalizeCategories(categories = []) {
  return Array.from(
    new Set(
      categories
        .map((category) => String(category).trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normalizeValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
}

function parseCurrencyInput(value) {
  const cleanValue = value.replace(/[^\d,.-]/g, '');
  const normalized = cleanValue.includes(',')
    ? cleanValue.replace(/\./g, '').replace(',', '.')
    : cleanValue.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatCurrency(value) {
  return normalizeValue(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function App() {
  if (!firebaseReady) {
    return <SetupMissing />;
  }

  return <ChecklistApp />;
}

function ChecklistApp() {
  const auth = useMemo(() => getAuth(app), []);
  const db = useMemo(() => getFirestore(app), []);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemValue, setNewItemValue] = useState('');
  const [newItemCategories, setNewItemCategories] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [openItemId, setOpenItemId] = useState(null);
  const [error, setError] = useState('');

  const isAllowedUser = !user
    ? false
    : allowedEmails.length === 0 || allowedEmails.includes(user.email.toLowerCase());

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, [auth]);

  useEffect(() => {
    if (!user || !isAllowedUser) {
      setItems([]);
      setItemsLoading(false);
      return undefined;
    }

    setItemsLoading(true);
    const itemsQuery = query(collection(db, 'items'), orderBy('createdAt', 'desc'));

    return onSnapshot(
      itemsQuery,
      (snapshot) => {
        setItems(
          snapshot.docs.map((itemDoc) => ({
            id: itemDoc.id,
            ...itemDoc.data(),
            links: normalizeLinks(itemDoc.data().links),
            categories: normalizeCategories(itemDoc.data().categories),
            value: normalizeValue(itemDoc.data().value),
          })),
        );
        setItemsLoading(false);
        setError('');
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setItemsLoading(false);
      },
    );
  }, [db, isAllowedUser, user]);

  useEffect(() => {
    if (!user || !isAllowedUser) {
      setFilters(defaultFilters);
      return undefined;
    }

    return onSnapshot(doc(db, 'appState', 'filters'), (snapshot) => {
      setFilters(snapshot.exists() ? normalizeFilters(snapshot.data()) : defaultFilters);
    });
  }, [db, isAllowedUser, user]);

  useEffect(() => {
    if (!user || !isAllowedUser) {
      setPresenceUsers([]);
      return undefined;
    }

    const presenceRef = collection(db, 'presence');
    return onSnapshot(presenceRef, (snapshot) => {
      const now = Date.now();
      setPresenceUsers(
        snapshot.docs
          .map((presenceDoc) => ({ id: presenceDoc.id, ...presenceDoc.data() }))
          .filter((presence) => presence.uid !== user.uid && presence.online)
          .filter((presence) => {
            const lastSeen = presence.updatedAt?.toMillis?.();
            return !lastSeen || now - lastSeen < 45000;
          })
          .map((presence) => ({
            ...presence,
            x: Math.min(Math.max(Number(presence.x) || 0, 0), 1),
            y: Math.min(Math.max(Number(presence.y) || 0, 0), 1),
          })),
      );
    });
  }, [db, isAllowedUser, user]);

  useEffect(() => {
    if (!user || !isAllowedUser) return undefined;

    const profile = getPresenceProfile(user.email);
    const presenceRef = doc(db, 'presence', user.uid);
    let lastWrite = 0;

    const writePresence = (patch = {}) => {
      setDoc(
        presenceRef,
        {
          uid: user.uid,
          email: user.email,
          name: user.displayName || profile.label,
          color: profile.color,
          label: profile.label,
          online: true,
          updatedAt: serverTimestamp(),
          ...patch,
        },
        { merge: true },
      ).catch(() => {});
    };

    const handlePointerMove = (event) => {
      const now = Date.now();
      if (now - lastWrite < 90) return;
      lastWrite = now;
      writePresence({
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      });
    };

    const handleVisibilityChange = () => {
      writePresence({ online: !document.hidden });
    };

    writePresence({ x: 0.5, y: 0.5 });
    const heartbeat = window.setInterval(() => writePresence(), 15000);
    window.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setDoc(presenceRef, { online: false, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    };
  }, [db, isAllowedUser, user]);

  async function handleLogin() {
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  async function handleAddItem(event) {
    event.preventDefault();
    const name = newItemName.trim();
    if (!name) return;

    await addDoc(collection(db, 'items'), {
      name,
      value: parseCurrencyInput(newItemValue),
      categories: normalizeCategories(newItemCategories),
      checked: false,
      links: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setNewItemName('');
    setNewItemValue('');
    setNewItemCategories([]);
  }

  async function updateItem(itemId, patch) {
    await updateDoc(doc(db, 'items', itemId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  }

  function updateFilters(patch) {
    const nextFilters = normalizeFilters({ ...filters, ...patch });
    setFilters(nextFilters);
    setDoc(
      doc(db, 'appState', 'filters'),
      {
        ...nextFilters,
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
      },
      { merge: true },
    ).catch((filterError) => setError(filterError.message));
  }

  async function handleRemoveItem(itemId) {
    await deleteDoc(doc(db, 'items', itemId));
    if (openItemId === itemId) {
      setOpenItemId(null);
    }
  }

  if (authLoading) {
    return <Shell status="Carregando..." />;
  }

  if (!user) {
    return (
      <Shell>
        <section className="login-panel">
          <div>
            <p className="eyebrow">Checklist da Casa</p>
            <h1>Compras compartilhadas, sem bagunca.</h1>
            <p>Entre com Google para acessar a lista sincronizada.</p>
          </div>
          <button className="primary-action" type="button" onClick={handleLogin}>
            <LogIn size={18} />
            Entrar
          </button>
          {error && <p className="error-text">{error}</p>}
        </section>
      </Shell>
    );
  }

  if (!isAllowedUser) {
    return (
      <Shell>
        <section className="login-panel">
          <div>
            <p className="eyebrow">Acesso restrito</p>
            <h1>Este e-mail nao esta liberado.</h1>
            <p>{user.email}</p>
          </div>
          <button className="secondary-action" type="button" onClick={() => signOut(auth)}>
            <LogOut size={18} />
            Sair
          </button>
        </section>
      </Shell>
    );
  }

  const boughtCount = items.filter((item) => item.checked).length;
  const totalLinks = items.reduce((total, item) => total + item.links.length, 0);
  const estimatedValue = items.reduce((total, item) => total + normalizeValue(item.value), 0);
  const spentValue = items.reduce(
    (total, item) => total + (item.checked ? normalizeValue(item.value) : 0),
    0,
  );
  const allCategories = Array.from(
    new Set(items.flatMap((item) => normalizeCategories(item.categories))),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(filters.searchTerm.trim().toLowerCase());
    const matchesFavorites = !filters.favoritesOnly || item.links.some((link) => link.favorite);
    const matchesPurchase =
      filters.purchaseFilter === 'all' ||
      (filters.purchaseFilter === 'bought' && item.checked) ||
      (filters.purchaseFilter === 'pending' && !item.checked);
    const matchesCategories =
      filters.selectedCategories.length === 0 ||
      filters.selectedCategories.every((category) => item.categories.includes(category));

    return matchesSearch && matchesFavorites && matchesPurchase && matchesCategories;
  });
  const hasActiveFilters =
    filters.searchTerm.trim() !== '' ||
    filters.favoritesOnly ||
    filters.selectedCategories.length > 0 ||
    filters.purchaseFilter !== 'all';

  return (
    <Shell>
      <header className="app-header">
        <div>
          <p className="eyebrow">Checklist da Casa</p>
          <h1>Lista de compras</h1>
        </div>
        <button className="icon-button with-label" type="button" onClick={() => signOut(auth)} title="Sair">
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </header>

      <section className="stats-row" aria-label="Resumo">
        <div>
          <strong>{items.length}</strong>
          <span>itens</span>
        </div>
        <div>
          <strong>{boughtCount}</strong>
          <span>comprados</span>
        </div>
        <div>
          <strong>{totalLinks}</strong>
          <span>links</span>
        </div>
        <div className="money-stat">
          <strong>{formatCurrency(estimatedValue)}</strong>
          <span>estimado</span>
        </div>
        <div className="money-stat">
          <strong>{formatCurrency(spentValue)}</strong>
          <span>gasto</span>
        </div>
      </section>

      <form className="add-item-form" onSubmit={handleAddItem}>
        <input
          value={newItemName}
          onChange={(event) => setNewItemName(event.target.value)}
          placeholder="Novo item (obrigatorio)"
          aria-label="Novo item obrigatorio"
        />
        <input
          className="value-input"
          value={newItemValue}
          onChange={(event) => setNewItemValue(event.target.value)}
          placeholder="Valor (opcional)"
          aria-label="Valor opcional"
        />
        <CategoryInput
          value={newItemCategories}
          suggestions={allCategories}
          onChange={setNewItemCategories}
          placeholder="Categorias (opcional)"
        />
        <button className="primary-action compact" type="submit">
          <Plus size={18} />
          Adicionar
        </button>
      </form>

      <FilterBar
        searchTerm={filters.searchTerm}
        selectedCategories={filters.selectedCategories}
        favoritesOnly={filters.favoritesOnly}
        purchaseFilter={filters.purchaseFilter}
        allCategories={allCategories}
        totalCount={items.length}
        visibleCount={filteredItems.length}
        onSearchChange={(searchTerm) => updateFilters({ searchTerm })}
        onCategoriesChange={(selectedCategories) => updateFilters({ selectedCategories })}
        onFavoritesOnlyChange={(favoritesOnly) => updateFilters({ favoritesOnly })}
        onPurchaseFilterChange={(purchaseFilter) => updateFilters({ purchaseFilter })}
        onClear={() => {
          updateFilters(defaultFilters);
        }}
      />

      {error && <p className="error-text">{error}</p>}

      <main className="item-list">
        {itemsLoading && <p className="empty-state">Carregando itens...</p>}
        {!itemsLoading && items.length === 0 && <p className="empty-state">Nenhum item cadastrado ainda.</p>}
        {!itemsLoading && items.length > 0 && filteredItems.length === 0 && (
          <p className="empty-state">
            Nenhum item encontrado{hasActiveFilters ? ' com os filtros atuais.' : '.'}
          </p>
        )}
        {filteredItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            isOpen={openItemId === item.id}
            categorySuggestions={allCategories}
            onToggleOpen={() => setOpenItemId(openItemId === item.id ? null : item.id)}
            onUpdate={(patch) => updateItem(item.id, patch)}
            onRemove={() => handleRemoveItem(item.id)}
          />
        ))}
      </main>

      <PresenceLayer users={presenceUsers} />
    </Shell>
  );
}

function PresenceLayer({ users }) {
  if (users.length === 0) return null;

  return (
    <div className="presence-layer" aria-hidden="true">
      {users.map((presence) => (
        <div
          className="presence-cursor"
          key={presence.uid}
          style={{
            '--cursor-color': presence.color,
            left: `${presence.x * 100}%`,
            top: `${presence.y * 100}%`,
          }}
        >
          <div className="presence-pointer" />
          <span>{presence.label || presence.name || presence.email}</span>
        </div>
      ))}
    </div>
  );
}

function FilterBar({
  searchTerm,
  selectedCategories,
  favoritesOnly,
  purchaseFilter,
  allCategories,
  totalCount,
  visibleCount,
  onSearchChange,
  onCategoriesChange,
  onFavoritesOnlyChange,
  onPurchaseFilterChange,
  onClear,
}) {
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const hasActiveFilters =
    searchTerm.trim() !== '' || favoritesOnly || selectedCategories.length > 0 || purchaseFilter !== 'all';

  function toggleCategory(category) {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter((selected) => selected !== category));
      return;
    }
    onCategoriesChange([...selectedCategories, category]);
  }

  return (
    <section className="filters-panel" aria-label="Filtros">
      <label className="search-field">
        <Search size={18} />
        <input
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Pesquisar item"
          aria-label="Pesquisar item por nome"
        />
      </label>

      <div className="category-filter" onBlur={() => window.setTimeout(() => setCategoryMenuOpen(false), 120)}>
        <button
          className={`secondary-action filter-button ${selectedCategories.length > 0 ? 'active' : ''}`}
          type="button"
          onClick={() => setCategoryMenuOpen(!categoryMenuOpen)}
        >
          <Tag size={18} />
          Categorias
          {selectedCategories.length > 0 && <strong>{selectedCategories.length}</strong>}
        </button>

        {categoryMenuOpen && (
          <div className="category-filter-menu">
            {allCategories.length === 0 && <p className="empty-state small">Nenhuma categoria ainda.</p>}
            {allCategories.map((category) => (
              <label className="category-option" key={category}>
                <input
                  checked={selectedCategories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  type="checkbox"
                />
                <span>{category}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        className={`secondary-action filter-button ${favoritesOnly ? 'active' : ''}`}
        type="button"
        onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
      >
        <Star size={18} />
        Favoritos
      </button>

      <div className="status-filter" aria-label="Filtro de compra">
        <button
          className={`secondary-action filter-button ${purchaseFilter === 'bought' ? 'active' : ''}`}
          type="button"
          onClick={() => onPurchaseFilterChange(purchaseFilter === 'bought' ? 'all' : 'bought')}
        >
          <Check size={18} />
          Comprados
        </button>
        <button
          className={`secondary-action filter-button ${purchaseFilter === 'pending' ? 'active' : ''}`}
          type="button"
          onClick={() => onPurchaseFilterChange(purchaseFilter === 'pending' ? 'all' : 'pending')}
        >
          Pendentes
        </button>
      </div>

      {hasActiveFilters && (
        <button className="icon-button with-label" type="button" onClick={onClear} title="Limpar filtros">
          <X size={18} />
          <span>Limpar</span>
        </button>
      )}

      <span className="filter-count">
        {visibleCount} de {totalCount}
      </span>
    </section>
  );
}

function Shell({ children, status }) {
  return (
    <div className="page-shell">
      {status ? <p className="empty-state">{status}</p> : children}
    </div>
  );
}

function SetupMissing() {
  return (
    <Shell>
      <section className="login-panel">
        <div>
          <p className="eyebrow">Configuracao pendente</p>
          <h1>Firebase ainda nao foi configurado.</h1>
          <p>Preencha o arquivo .env usando .env.example como base.</p>
        </div>
      </section>
    </Shell>
  );
}

function ItemRow({ item, isOpen, categorySuggestions, onToggleOpen, onUpdate, onRemove }) {
  const [draftName, setDraftName] = useState(item.name);
  const favoriteCount = item.links.filter((link) => link.favorite).length;
  const [draftValue, setDraftValue] = useState(item.value ? formatCurrency(item.value) : '');

  useEffect(() => {
    setDraftName(item.name);
  }, [item.name]);

  useEffect(() => {
    setDraftValue(item.value ? formatCurrency(item.value) : '');
  }, [item.value]);

  function commitUpdate(patch) {
    onUpdate({
      categories: normalizeCategories(item.categories),
      value: normalizeValue(item.value),
      ...patch,
    });
  }

  function updateLinks(nextLinks) {
    commitUpdate({ links: nextLinks });
  }

  function updateCategories(nextCategories) {
    commitUpdate({ categories: normalizeCategories(nextCategories) });
  }

  return (
    <article className={`item-row ${item.checked ? 'is-checked' : ''}`}>
      <div className="item-summary">
        <button
          className={`check-button ${item.checked ? 'active' : ''}`}
          type="button"
          onClick={() => commitUpdate({ checked: !item.checked })}
          title={item.checked ? 'Marcar como pendente' : 'Marcar como comprado'}
        >
          <Check size={18} />
        </button>

        <input
          className="item-name-input"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => {
            const name = draftName.trim();
            if (name && name !== item.name) commitUpdate({ name });
            if (!name) setDraftName(item.name);
          }}
          aria-label="Nome do item"
        />

        <input
          className="item-value-input"
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={() => {
            const nextValue = parseCurrencyInput(draftValue);
            commitUpdate({ value: nextValue });
            setDraftValue(nextValue ? formatCurrency(nextValue) : '');
          }}
          placeholder="R$ 0,00"
          aria-label="Valor do item"
        />

        <div className="item-meta">
          <span>
            <LinkIcon size={15} />
            {item.links.length}
          </span>
          <span>
            <Star size={15} />
            {favoriteCount}
          </span>
          <span>
            <Tag size={15} />
            {item.categories.length}
          </span>
        </div>

        <button className="icon-button" type="button" onClick={onToggleOpen} title={isOpen ? 'Fechar' : 'Abrir'}>
          {isOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
        </button>

        <button className="icon-button danger" type="button" onClick={onRemove} title="Remover item">
          <Trash2 size={18} />
        </button>
      </div>

      {item.categories.length > 0 && (
        <div className="category-strip">
          {item.categories.map((category) => (
            <span className="category-chip" key={category}>
              {category}
            </span>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="item-details">
          <CategoryInput
            value={item.categories}
            suggestions={categorySuggestions}
            onChange={updateCategories}
            placeholder="Categorias do item"
          />
          <LinkEditor links={item.links} onChange={updateLinks} />
        </div>
      )}
    </article>
  );
}

function CategoryInput({ value, suggestions, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const cleanDraft = draft.trim().toLowerCase();
  const availableSuggestions = suggestions
    .filter((category) => !value.includes(category))
    .filter((category) => (cleanDraft ? category.includes(cleanDraft) : true))
    .slice(0, 6);

  function addCategory(rawCategory = draft) {
    const category = rawCategory.trim().toLowerCase();
    if (!category || value.includes(category)) {
      setDraft('');
      return;
    }
    onChange([...value, category]);
    setDraft('');
  }

  function removeCategory(categoryToRemove) {
    onChange(value.filter((category) => category !== categoryToRemove));
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addCategory();
    }
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      removeCategory(value[value.length - 1]);
    }
  }

  return (
    <div className="category-input-wrap">
      <div className="category-input">
        {value.map((category) => (
          <button
            className="category-chip removable"
            key={category}
            type="button"
            onClick={() => removeCategory(category)}
            title="Remover categoria"
          >
            {category}
            <X size={14} />
          </button>
        ))}
        <input
          value={draft}
          onBlur={() => {
            addCategory();
            window.setTimeout(() => setFocused(false), 120);
          }}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={placeholder}
        />
      </div>

      {focused && availableSuggestions.length > 0 && (
        <div className="category-suggestions">
          {availableSuggestions.map((category) => (
            <button
              key={category}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                addCategory(category);
              }}
            >
              {category}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkEditor({ links, onChange }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');

  function addLink(event) {
    event.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    onChange([
      ...links,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        url: cleanUrl,
        note: note.trim(),
        favorite: false,
      },
    ]);
    setTitle('');
    setUrl('');
    setNote('');
  }

  function patchLink(linkId, patch) {
    onChange(links.map((link) => (link.id === linkId ? { ...link, ...patch } : link)));
  }

  function removeLink(linkId) {
    onChange(links.filter((link) => link.id !== linkId));
  }

  const sortedLinks = links
    .map((link, index) => ({ ...link, originalIndex: index }))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.originalIndex - b.originalIndex);

  return (
    <section className="links-panel">
      <form className="link-form" onSubmit={addLink}>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome do link" />
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observacao" />
        <button className="primary-action compact" type="submit">
          <Plus size={18} />
          Link
        </button>
      </form>

      <div className="links-list">
        {links.length === 0 && <p className="empty-state small">Nenhum link neste item.</p>}
        {sortedLinks.map((link) => (
          <div className="link-row" key={link.id}>
            <button
              className={`icon-button favorite ${link.favorite ? 'active' : ''}`}
              type="button"
              onClick={() => patchLink(link.id, { favorite: !link.favorite })}
              title={link.favorite ? 'Remover favorito' : 'Favoritar link'}
            >
              <Star size={18} />
            </button>
            <div className="link-fields">
              <input
                value={link.title}
                onChange={(event) => patchLink(link.id, { title: event.target.value })}
                placeholder="Nome"
                aria-label="Nome do link"
              />
              <input
                value={link.url}
                onChange={(event) => patchLink(link.id, { url: event.target.value })}
                placeholder="URL"
                aria-label="URL"
              />
              <input
                value={link.note}
                onChange={(event) => patchLink(link.id, { note: event.target.value })}
                placeholder="Observacao"
                aria-label="Observacao do link"
              />
            </div>
            <a className="icon-button" href={link.url} target="_blank" rel="noreferrer" title="Abrir link">
              <ExternalLink size={18} />
            </a>
            <button className="icon-button danger" type="button" onClick={() => removeLink(link.id)} title="Remover link">
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
