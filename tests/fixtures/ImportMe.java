package com.acme.occ;

import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import javax.annotation.Resource;
import org.springframework.security.access.annotation.Secured;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

/** Order notes. */
@Controller
@RequestMapping(value = "/{baseSiteId}/order-notes")
@Api(tags = "Order Notes")
@Deprecated
public class OrderNotesController extends BaseController
{
    @Resource(name = "orderNotesFacade")
    private Object orderNotesFacade;

    // returns notes; "quoted } brace" in comment
    @Secured({ "ROLE_CLIENT" })
    @RequestMapping(value = "/{orderCode}", method = RequestMethod.GET, produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseBody
    @ApiOperation(value = "List notes", notes = "Lists notes")
    public List<String> list(@PathVariable("orderCode") final String orderCode,
            @RequestParam(value = "limit", defaultValue = "10") final Integer limit,
            final HttpServletRequest request)
    {
        final String s = "}";
        return null;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public void add(@RequestBody final Map<String, String> note)
    {
    }

    private void helper()
    {
    }
}
