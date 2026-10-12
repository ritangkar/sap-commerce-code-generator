package com.example.occ.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A note attached to a product")
public class ProductNoteWsDTO implements Serializable
{
    private static final long serialVersionUID = 1L;

    @NotNull
    @Schema(description = "Unique note code", required = true)
    private String code;

    @NotNull
    @Schema(description = "Note text", required = true)
    private String text;

    @Schema(description = "Priority")
    private Integer priority;

    public String getCode()
    {
        return code;
    }

    public void setCode(final String code)
    {
        this.code = code;
    }

    public String getText()
    {
        return text;
    }

    public void setText(final String text)
    {
        this.text = text;
    }

    public Integer getPriority()
    {
        return priority;
    }

    public void setPriority(final Integer priority)
    {
        this.priority = priority;
    }
}
