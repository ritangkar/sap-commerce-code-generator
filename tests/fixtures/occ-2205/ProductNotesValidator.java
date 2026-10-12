package com.example.occ.validators;

import org.springframework.validation.Errors;
import org.springframework.validation.ValidationUtils;
import org.springframework.validation.Validator;

import com.example.occ.dto.ProductNoteWsDTO;

/**
 * Validator skeleton. TODO: add project-specific validation rules and message keys.
 */
public class ProductNotesValidator implements Validator
{
    @Override
    public boolean supports(final Class<?> clazz)
    {
        return ProductNoteWsDTO.class.equals(clazz);
    }

    @Override
    public void validate(final Object target, final Errors errors)
    {
        ValidationUtils.rejectIfEmptyOrWhitespace(errors, "code", "code.required");
        ValidationUtils.rejectIfEmptyOrWhitespace(errors, "text", "text.required");
        // TODO: add further validation rules
    }
}
