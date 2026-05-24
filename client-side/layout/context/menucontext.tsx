import React, { useState, createContext } from 'react';

export const MenuContext = createContext({} as any);

export const MenuProvider = ({ children }: any) => {
    const [activeMenu, setActiveMenu] = useState('');

    const value = {
        activeMenu,
        setActiveMenu
    };

    return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
};
