import React, { createContext, useContext, useMemo } from 'react';

/**
 * One refresh that reaches everything.
 *
 * The dashboard owns the shared load, but several screens keep a fetch of
 * their own: Manage reads /manage, Roadmap reads /roadmap, Stats reads /stats.
 * Refreshing only the dashboard left those holding data from before the change,
 * so logging a rep on Home and then opening Roadmap showed the old figure until
 * a reload.
 *
 * Every change now bumps one version number. Screens list it as a dependency of
 * their own effect, so they re-read the moment anything anywhere changes, and
 * the whole app agrees about what is true.
 */
const DataContext = createContext({ version: 0, refresh: async () => {} });

export const DataProvider = ({ version, refresh, children }) => {
  const value = useMemo(() => ({ version, refresh }), [version, refresh]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

/** Call after any write; reloads the shared data AND every self-fetching screen. */
export const useRefresh = () => useContext(DataContext).refresh;

/** Put in an effect's dependency list to re-read whenever anything changes. */
export const useDataVersion = () => useContext(DataContext).version;

export default DataContext;
