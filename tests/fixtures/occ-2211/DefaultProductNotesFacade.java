package com.example.occ.facades;

import com.example.occ.dto.ProductNoteWsDTO;

/**
 * Facade implementation skeleton. TODO: declare this class as a Spring bean named "productNotesFacade" in your extension's *-spring.xml.
 */
public class DefaultProductNotesFacade implements ProductNotesFacade
{
    @Override
    public ProductNoteWsDTO getNote(final String noteCode, final Boolean includeHistory)
    {
        // TODO: inject and call project-specific services, converters/populators and models here
        throw new UnsupportedOperationException("TODO: implement getNote");
    }

    @Override
    public ProductNoteWsDTO createNote(final ProductNoteWsDTO note)
    {
        // TODO: inject and call project-specific services, converters/populators and models here
        throw new UnsupportedOperationException("TODO: implement createNote");
    }
}
