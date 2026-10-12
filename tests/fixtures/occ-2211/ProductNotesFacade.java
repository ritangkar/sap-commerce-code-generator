package com.example.occ.facades;

import com.example.occ.dto.ProductNoteWsDTO;

/**
 * Facade skeleton for ProductNotesController. Scaffolding only: no business logic.
 */
public interface ProductNotesFacade
{
    /**
     * TODO: Get a product note
     * Facades normally work with *Data objects; map to/from WsDTOs in the controller layer if your project follows that convention.
     */
    ProductNoteWsDTO getNote(String noteCode, Boolean includeHistory);

    /**
     * TODO: Create a product note
     * Facades normally work with *Data objects; map to/from WsDTOs in the controller layer if your project follows that convention.
     */
    ProductNoteWsDTO createNote(ProductNoteWsDTO note);
}
