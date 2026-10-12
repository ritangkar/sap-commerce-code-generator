package com.example.occ.controllers;

import javax.annotation.Resource;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.annotation.Secured;
import org.springframework.stereotype.Controller;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.Errors;
import org.springframework.validation.Validator;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import de.hybris.platform.webservicescommons.errors.exceptions.WebserviceValidationException;

import com.example.occ.dto.ProductNoteWsDTO;
import com.example.occ.facades.ProductNotesFacade;

@Controller
@RequestMapping(value = "/{baseSiteId}/product-notes")
@Tag(name = "Product Notes")
public class ProductNotesController
{
    @Resource(name = "productNotesFacade")
    private ProductNotesFacade productNotesFacade;

    @Resource(name = "productNotesValidator")
    private Validator productNotesValidator;

    /**
     * Get a product note
     *
     * Returns a single product note by its code.
     *
     * @param noteCode Code of the note
     * @param includeHistory Include edit history
     * @return ProductNoteWsDTO
     */
    @Secured({ "ROLE_CLIENT", "ROLE_TRUSTED_CLIENT" })
    @RequestMapping(value = "/{noteCode}", method = RequestMethod.GET, produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    @Operation(summary = "Get a product note", description = "Returns a single product note by its code.", operationId = "getNote")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Note found"),
            @ApiResponse(responseCode = "404", description = "Note not found") })
    public ProductNoteWsDTO getNote(@Parameter(description = "Code of the note", required = true) @PathVariable(value = "noteCode") final String noteCode,
            @Parameter(description = "Include edit history", required = false) @RequestParam(value = "includeHistory", defaultValue = "false") final Boolean includeHistory)
    {
        return productNotesFacade.getNote(noteCode, includeHistory);
    }

    /**
     * Create a product note
     *
     * @param note Note to create
     * @return ProductNoteWsDTO
     */
    @Secured({ "ROLE_CLIENT", "ROLE_TRUSTED_CLIENT" })
    @RequestMapping(value = "", method = RequestMethod.POST, consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a product note", operationId = "createNote")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "201", description = "Created"),
            @ApiResponse(responseCode = "400", description = "Validation error") })
    public ProductNoteWsDTO createNote(@Parameter(description = "Note to create", required = true) @RequestBody final ProductNoteWsDTO note)
    {
        // TODO: verify the WebserviceValidationException import for your Commerce version
        final Errors errors = new BeanPropertyBindingResult(note, "note");
        productNotesValidator.validate(note, errors);
        if (errors.hasErrors())
        {
            throw new WebserviceValidationException(errors);
        }
        return productNotesFacade.createNote(note);
    }
}
