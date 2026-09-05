package com.lumora.core.conversation.application.support;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumora.core.conversation.domain.entity.*;
import com.lumora.core.conversation.domain.model.*;
import com.lumora.core.conversation.infrastructure.persistence.*;
import com.lumora.core.memory.application.service.MemoryService;
import com.lumora.core.task.application.service.TaskService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.function.Consumer;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class IssueListContextReproductionTest {
    @org.junit.jupiter.api.io.TempDir java.nio.file.Path temporaryDirectory;
    final Instant now=Instant.parse("2026-09-04T00:00:00Z");
    final Clock clock=Clock.fixed(now,ZoneOffset.UTC);
    final ConversationMapper conversations=mock(ConversationMapper.class);
    final ConversationMessageMapper messages=mock(ConversationMessageMapper.class);
    final ConversationContextSummaryMapper summaryMapper=mock(ConversationContextSummaryMapper.class);
    final List<ConversationContextSummary> summaries=new ArrayList<>();
    final ConversationContextSummaryService summaryService=new ConversationContextSummaryService(summaryMapper,clock);
    final TransactionTemplate tx=mock(TransactionTemplate.class);
    final ConversationPersistenceService service=new ConversationPersistenceService(conversations,messages,mock(TaskService.class),mock(MemoryService.class),summaryService,clock,tx,new ObjectMapper());
    void setup() {
        when(conversations.selectOne(any())).thenReturn(new Conversation("conversation","task",now,now));
        when(summaryMapper.selectList(any())).thenAnswer(i->summaries.stream().filter(s->"ACTIVE".equals(s.getStatus())).sorted(Comparator.comparingInt(ConversationContextSummary::getVersion).reversed()).limit(1).toList());
        when(summaryMapper.insert(any(ConversationContextSummary.class))).thenAnswer(i->{summaries.add(i.getArgument(0));return 1;});
        doAnswer(i->{Consumer<TransactionStatus> action=i.getArgument(0);action.accept(mock(TransactionStatus.class));return null;}).when(tx).executeWithoutResult(any());
    }
    ConversationMessage message(String id,int seq,String parent,String text,boolean active) {
        var m=new ConversationMessage(id,"conversation",seq,ChatMessageRole.USER,text,"",0,0,0,now);
        m.setParentMessageId(parent);m.setMessageDepth(parent==null?1:2);m.setActivePath(active);return m;
    }
    @Test void lm009SwitchingToARejectsBSummary() {
        setup();
        var root=message("root",1,null,"shared",true);
        var a=message("a",2,"root","A-only-use-SQLite",false);
        var b=message("b",3,"root","B-only-use-Postgres",true);
        var rows=List.of(root,a,b);
        when(messages.selectList(any())).thenReturn(rows);
        summaryService.persist("conversation","B-only-use-Postgres",3,100,10);
        service.activateBranch("task","a");
        assertThat(a.isActivePath()).isTrue();assertThat(b.isActivePath()).isFalse();
        var current=message("next",4,"a","continue",true);
        ConversationRunContext context=ReflectionTestUtils.invokeMethod(service,"createRunContext","task","conversation",rows.stream().filter(ConversationMessage::isActivePath).toList(),current,null);
        System.out.println("REPRO LM-009 activeA="+a.isActivePath()+" activeB="+b.isActivePath()+" summary="+context.getConversationSummary()+" modelMessages="+context.getModelMessages());
        assertThat(context.getConversationSummary()).isNull();
        assertThat(context.getModelMessages().stream().map(ChatMessage::getContent)).contains("A-only-use-SQLite");
        service.activateBranch("task","b");
        ConversationRunContext restored=ReflectionTestUtils.invokeMethod(service,"createRunContext","task","conversation",rows.stream().filter(ConversationMessage::isActivePath).toList(),message("b-next",5,"b","continue B",true),null);
        assertThat(restored.getConversationSummary()).isEqualTo("B-only-use-Postgres");
    }
    @Test void lm010CompactionRetainsPdfManifestWithoutOldText() throws Exception {
        setup();
        var pdf=message("pdf-message",1,null,"read PDF",true);
        var pdfPath=temporaryDirectory.resolve("manual.pdf");
        java.nio.file.Files.writeString(pdfPath,"%PDF-1.4\n%%EOF\n");
        pdf.setAttachmentsJson(new ObjectMapper().writeValueAsString(List.of(new MessageAttachment("pdf-1","manual.pdf","application/pdf",20,pdfPath.toString(),MessageAttachment.Kind.FILE,MessageAttachment.Source.LOCAL_FILE))));
        var reply=message("reply",2,"pdf-message","old PDF conversation text",true);
        var next=message("next",3,"pdf-message","read another page",true);
        ConversationRunContext before=ReflectionTestUtils.invokeMethod(service,"createRunContext","task","conversation",List.of(pdf,reply),next,null);
        summaryService.persist("conversation","Attachment pdf-1 manual.pdf is available",2,100,10);
        ConversationRunContext after=ReflectionTestUtils.invokeMethod(service,"createRunContext","task","conversation",List.of(pdf,reply),next,null);
        String beforeJson=new ObjectMapper().valueToTree(before.getModelMessages()).toString();
        String afterJson=new ObjectMapper().valueToTree(after.getModelMessages()).toString();
        assertThat(beforeJson).contains("pdf-1");
        System.out.println("REPRO LM-010 beforeHasPdf="+beforeJson.contains("pdf-1")+" afterHasPdf="+afterJson.contains("pdf-1")+" summary="+after.getConversationSummary());
        assertThat(afterJson).contains("pdf-1").doesNotContain("old PDF conversation text");
        assertThat(after.getConversationSummary()).contains("pdf-1");
        java.nio.file.Files.delete(pdfPath);
        ConversationRunContext deleted=ReflectionTestUtils.invokeMethod(service,"createRunContext","task","conversation",List.of(pdf,reply),next,null);
        assertThat(new ObjectMapper().valueToTree(deleted.getModelMessages()).toString()).doesNotContain("pdf-1");
    }
}
